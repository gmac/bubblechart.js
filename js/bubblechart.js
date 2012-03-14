// ==ClosureCompiler==
// @output_file_name gi-bubblechart.js
// @compilation_level SIMPLE_OPTIMIZATIONS
// ==/ClosureCompiler==

// JSLint options:
/*global jQuery, $ */
/*jslint browser:true, white:true, nomen:true, plusplus:true */

/**
* Bubble chart.
* @author Greg MacWilliam, Threespot.
*/
function BubbleChart(opts) {
	"use strict";
	opts = (opts || {});
	
	if (opts.renderTo) {
		this.setOptions(opts);
		this.display = new BubbleChart.Display(this);
		this.controls = new BubbleChart.Controls(this);
		this.nodes = [];
	}
	return this;
}

(function() {
"use strict";

BubbleChart.prototype = (function() {
	return {
		options: null,
		model: null,
		display: null,
		controls: null,
		nodes: null,
		
		// Sets initial configuration options, applying defaults where required.
		setOptions: function(opts) {
			// Reference DOM container.
			opts.renderTo = $('#'+ opts.renderTo);
			
			// Set default sizes for width and height.
			if (isNaN(opts.graphWidth)) {
				opts.graphWidth = opts.renderTo.width();
			}
			if (isNaN(opts.graphHeight)) {
				opts.graphHeight = opts.renderTo.height()-35;
			}
			
			// Set default margin and padding values.
			if (isNaN(opts.margin)) {
				opts.margin = 5;
			}
			if (isNaN(opts.padding)) {
				opts.padding = 0;
			}
			this.options = opts;
		},
		
		// Specifies if the chart is loaded with data.
		loaded: function() {
			return (this.model && this.model.loaded);
		},
		
		// Loads new data into the model.
		load: function(config) {
			var self = this;
			this.clear();
		
			// Create and load a new model.
			this.model = new BubbleChart.Model(config, function() {
				self.nodes = self.model.getNodes( self.nodes );
				self.display.reset();
				self.controls.reset();
			
				if (config.success) {
					config.success();
					config.success = null;
				}
			
				config = null;
				self = null;
			});
			return this;
		},
		
		// Clears existing data and display from the chart.
		clear: function() {
			var i;
			this.pause();
			
			for (i in this.nodes) {
				if (this.nodes.hasOwnProperty(i)) {
					this.nodes[i].clear();
				}
			}
			
			this.display.clear();
			this.controls.clear();
			this.controls.togglePlayback(false);
			BubbleChart.Node.paletteIndex = 0;
			
			if (this.model) {
				this.model.destroy();
				this.model = null;
			}
		},

		// Plays the timeline animation.
		play: function() {
			if (this.loaded()) {
				this.controls.togglePlayback(true);
			}
			return this;
		},

		// Pauses the timeline animation's playback.
		pause: function() {
			if (this.loaded()) {
				this.controls.togglePlayback(false);
			}
			return this;
		},

		// Rewinds to the beginning of the timeline animation.
		rewind: function() {
			if (this.loaded()) {
				this.controls.scrubToPercent(0);
			}
			return this;
		},

		// Triggers the display to refresh while automatic updates are not enabled.
		refresh: function() {
			if (this.loaded() && !this.controls.isPlaying()) {
				this.display.update();
			}
		},
		
		// destroys the chart.
		destroy: function() {
			this.clear();
			this.display.destroy();
			this.controls.destroy();
			this.options.renderTo = null;
			this.options = null;
			this.display = null;
			this.controls = null;
			
			while (this.nodes.length) {
				this.nodes.pop();
			}
			this.nodes = null;
		}
	};
}());

// -------------------------------------------------------
// Model
// -------------------------------------------------------
/**
* Main controller for loading and managing all application data.
*/
BubbleChart.Model = function(config, callback) {
	var self = this;
	config.style = (config.style || {});
	this.title = (config.title || "");
	this.subhead = (config.subhead || "");
	this.axisX = new BubbleChart.Model.Axis('x', config.axisX);
	this.axisY = new BubbleChart.Model.Axis('y', config.axisY);
	this.axisZ = new BubbleChart.Model.Axis('z', config.axisZ);
	this.axisC = new BubbleChart.Model.Axis('c', config.axisC);
	this.minRadius = (config.style.minRadius || 5);
	this.maxRadius = (config.style.maxRadius || 100);
	this.columns = [];
	this.years = [];
	
	function complete(csv) {
		var data = BubbleChart.utils.parseCSV(csv),
			len = data[0].length,
			col,
			year,
			j;

		for (j=0; j < len; j++) {
			col = new BubbleChart.Model.Column(j, data);
			year = col.year.toString();
			self.columns.push( col );

			// test if the column's year has been logged yet. If not, record it.
			if (self.years.join(",").indexOf(year) < 0 && year.length === 4){
				self.years.push(col.year);
			}

			// Try to add column to all axes.
			// (a column might associate with more than one)
			// Columns will be blocked from dissimilar axes.
			self.axisX.addColumn(col);
			self.axisY.addColumn(col);
			self.axisZ.addColumn(col);
			self.axisC.addColumn(col);
		}

		// Sort all years then initialize axes configurations.
		self.years.sort(function(a,b) { return a - b; });
		self.axisX.setPosition(0);
		self.axisY.setPosition(0);
		self.axisZ.setPosition(0);
		self.axisC.setPosition(0);
		self.loaded = true;
		self = null;
		
		if (callback) {
			callback();
			callback = null;
		}
	}
	
	// Load CSV data
	if (typeof(config.csv) === 'function') {
		// if function was provided, call it to start load.
		config.csv(complete);
	} else {
		// otherwise, load from CSV path.
		$.get(config.csv, complete, 'html');
	} 
};
BubbleChart.Model.prototype = (function() {
	return {
		title:"",
		subhead:"",
		axisX:null, // BCAxis
		axisY:null, // BCAxis
		axisZ:null, // BCAxis
		axisC:null, // BCAxis
		minRadius:5,
		maxRadius:100,
		data:null,
		columns:null,
		years:null,
		loaded:false,
		
		// Builds out a list of nodes based on the model.
		getNodes: function(reuse) {
			var labels = this.getColumnAt(0),
				numRequired = labels.values.length,
				numExisting = reuse.length,
				nodes = [],
				node,
				j;
				
			// purge excess bubbles.
			while (numRequired < numExisting) {
				node = reuse.pop();
				node.clear();
				node = null;
				numExisting -= 1;
			}
			
			// Create/recycle nodes.
			for (j=0; j < numRequired; j++) {
				
				// Create bubble objects.
				node = (j < numExisting ? reuse.pop() : new BubbleChart.Node());
				node.reset(j, labels.values[j]);
				nodes.push(node);
			}
			return nodes;
		},
		
		/**
		* Gets a data column with a specific label and year.
		*/
		getColumn: function(label, type, year) {
			var j, col;
			for (j in this.columns) {
				if (this.columns.hasOwnProperty(j)) {
					col = this.columns[j];
					if (col.label === label && col.type === type && col.year === year) {
						return col;
					}
				}
			}
			return null;
		},

		/**
		* Gets a data column with a specific label and year.
		*/
		getColumnAt: function(index) {
			if (index >= 0 && index < this.columns.length) {
				return this.columns[index];
			}
			return null;
		},
		
		/**
		* Destroys the model configuration to optimize for garbage collection.
		*/
		destroy: function() {
			// Destroy all axis.
			this.axisX.destroy();
			this.axisY.destroy();
			this.axisZ.destroy();
			this.axisC.destroy();
			
			// Decouple all axis.
			this.axisX = null;
			this.axisY = null;
			this.axisZ = null;
			this.axisC = null;
			this.data = null;
		}
	};
}());

/**
* Manager object for properties/values of individual data columns.
*/
BubbleChart.Model.Column = function(index, table) {
	this.index = index;
	this.label = table[0][index];
	this.type = table[1][index];
	this.year = parseInt(table[2][index], 10);
	this.values = [];
	var j,
		val,
		num,
		len=table.length;

	// Collect all column data values.
	// Start with the fourth row – first three rows were the label, type and year.
	for (j=3; j < len; j++) {
		val = table[j][index];
		num = parseFloat( val );

		if (!isNaN(num)) {
			this.minValue = isNaN(this.minValue) ? num : Math.min(this.minValue, num);
			this.maxValue = isNaN(this.maxValue) ? num : Math.max(num, this.maxValue);
		}
		
		// Collect all column values.
		// First column (labels) collects raw string values.
		// All other columns collect numbers or NaN.
		this.values.push( index > 0 ? num : val );
	}
	
	table = null;
};
BubbleChart.Model.Column.prototype = (function() {
	return {
		index:0,
		label:'',
		type:'',
		year:0,
		minValue:NaN,
		maxValue:NaN,
		values:null
	};
}());

/**
* Manager object for a complete axis of data over time.
* An axis object stores a collection of DataColumns with a common label and different years.
*/
BubbleChart.Model.Axis = function(id, config) {
	config = (config || {});
	this.axis = id;
	this.title = (config.title || config.label);
	this.label = config.label;
	this.type = config.type;
	this.enabled = (id === 'x' || id === 'y' || !!config.label);
	this.formatter = (config.formatter ? config.formatter : BubbleChart.utils.formatNumber);
	this.minPadding = (config.minPadding || 0);
	this.maxPadding = (config.maxPadding || 0);
	this.min = (config.min || NaN);
	this.max = (config.max || NaN);
	this.columns = [];
	this.years = [];
};
BubbleChart.Model.Axis.prototype = (function() {
	return {
		min:0,
		max:0,
		scrub:0,
		columns:null, // Array of BCDataColumns
		years:null, // Array of numbers
		enabled:false,
		isColorAxis:false,
		axis:'x',
		title:'',
		label:'',
		type:'',
		formatter: null,
		config:null,
		minPadding:0,
		maxPadding:0,
		position:0,
		alpha:0.7,
		rangeMin:null, //BCDataColumn
		rangeMax:null, //BCDataColumn

		/**
		* Specifies a minimum value for the axis' value range.
		* (this may be padded to extend beyond the actual values present within data)
		*/
		getMinValue: function() {
			return this.min - this.minPadding;
		},
		setMinValue: function(val) {
			this.minPadding = this.min - val;
		},

		/**
		* Specifies a maximum value for the axis' value range.
		* (this may be padded to extend beyond the actual values present within data)
		*/
		getMaxValue: function() {
			return this.max + this.maxPadding;
		},
		setMaxValue: function(val) {
			this.maxPadding = val - this.max;
		},

		/**
		* Specifies the delta of the total value range.
		*/
		getValueRange: function() {
			return this.getMaxValue() - this.getMinValue();
		},

		/**
		* Specifies a percent position (number 0 to 1) across the range of years to scrub to.
		* This method will detect which year bracket the position falls within,
		* then calculate a precise scrub position between those two years.
		*/
		setPosition: function(perc) {
			var range = 1/(this.years.length-1),
				tier = Math.floor(perc / range);
			this.scrub = (perc - range * tier) / range;
			
			// If scrub is within rounding-error margin of the next range,
			// Assume precision error and push to the next tier.
			if (this.scrub > 0.99 && tier < this.years.length-1) {
				this.scrub = 0;
				tier+=1;
			}
			
			this.rangeMin = this.columns[tier];
			this.rangeMax = this.columns[tier+1];
			if (!this.rangeMax) {
				this.rangeMax = this.rangeMin;
			}
			this.position = perc;
		},
		
		/**
		* Gets the year bracket that a percentage of the total span falls into.
		*/
		getYear: function(perc) {
			var range = 1/(this.years.length-1);
			return this.columns[ Math.floor(perc / range) ].year;
		},
		
		/**
		* Specifies the number of values within the active column.
		*/
		getNumValues: function() {
			if (!!this.rangeMin) {
				return this.rangeMin.values.length;
			}
			return 0;
		},

		/**
		* Interpolates a percent (0 to 1) range position value along the axis' total value range.
		*/
		getRangePosition: function(perc) {
			var min = this.getMinValue(),
				max = this.getMaxValue();
			return Math.round(min + ((max - min) * perc));
		},
		
		/**
		* Gets a value at the specified index within the active column range.
		*/
		getValueAt: function(index) {
			if (this.enabled && !!this.rangeMin && !!this.rangeMax) {
				var min = this.rangeMin.values[index],
					max = this.rangeMax.values[index],
					hasMin = !isNaN(min),
					hasMax = !isNaN(max);

				// Use a single year value if transitioning to/from a null value and almost at threshold.
				if (hasMin && !hasMax && this.scrub < 0.1) {
					max = min;
				} else if (!hasMin && hasMax && this.scrub > 0.9) {
					min = max;
				}

				return min + ((max - min) * this.scrub);
			}
			return 0;
		},

		/**
		* Gets the plot percentage of the provided value.
		*/
		plotValue: function(val, invert) {
			if (this.enabled) {
				invert = (invert || false);

				if (!isNaN(val)) {
					val = (val-this.getMinValue()) / this.getValueRange();
					return invert ? 1-val : val;
				}
				return NaN;
			}
			return 0;
		},
		
		/**
		* Gets the plot percentage of the specified index value.
		*/
		plotValueAt: function(index, invert) {
			return this.plotValueAt( this.getValueAt(index), invert );
		},

		/**
		* Gets the plot percentage of the specified index value.
		*/
		setNodeData: function(node) {
			var val = this.getValueAt(node.index);
			node['p'+this.axis] = this.plotValue( val );
			node['v'+this.axis] = val;
			return node;
		},
		
		/**
		* Calculates a mid-point ColorTransform at a specific percentage between a start and end ColorTransform.
		* @return The interpolated color value.
		*/
		plotColorAt: function(index) {
			/*if (this.isColorAxis && !!this.rangeMin && !!this.rangeMax) {
				var a = this.rangeMin.values[index], // 7-digit hex: #FFFFFF
					b = this.rangeMax.values[index], // 7-digit hex: #FFFFFF
					ar = parseInt(a.substr(1, 2), 16),
					ag = parseInt(a.substr(3, 2), 16),
					ab = parseInt(a.substr(5, 2), 16);
	
				if (a !== b) {
					// break out B components.
					var br = parseInt(b.substr(1, 2), 16),
						bg = parseInt(b.substr(3, 2), 16),
						bb = parseInt(b.substr(5, 2), 16);
		
					// interpolate midpoints.
					var cr = Math.round(ar + (br - ar) * this.scrub),
						cg = Math.round(ag + (bg - ag) * this.scrub),
						cb = Math.round(ab + (bb - ab) * this.scrub);
	
					// return as interpolated hex value.
					//return '#'+ cr.toString(16) + cg.toString(16) + cb.toString(16);
					return 'rgba('+ cr +','+ cg +','+ cb +','+ this.alpha +')';
				}
				return 'rgba('+ ar +','+ ag +','+ ab +','+ this.alpha +')';
			}*/
			return 'rgba(255,0,0,'+ this.alpha +')';
		},

		/**
		* Attempts to add a data column into the axis set.
		* Columns with a foreign label are rejected.
		*/
		addColumn: function(col) {
			if (this.enabled && col.label === this.label && col.type === this.type) {
				if (this.years.join(",").indexOf(col.year.toString()) < 0 && col.year.toString().length === 4) {
					this.years.push(col.year);
				}
				if (!isNaN(col.minValue)) {
					this.min = isNaN(this.min) ? col.minValue : Math.min(this.min, col.minValue);
				}
				if (!isNaN(col.maxValue)) {
					this.max = isNaN(this.max) ? col.maxValue : Math.max(this.max, col.maxValue);
				}
				this.years.sort(function(a,b) {return a - b;});
				this.columns.push(col);
				this.columns.sort(function(a,b) {return a.year - b.year;});
				return true;
			}
			return false;
		},

		/** @private converts a data set over to a color table.*/
		applyColorMap: function(node) {
			var colors = {},
				clist=node.children('c'),
				col,
				j,
				k;

			// Create table of color hex values.
			for (j in clist) {
				if (clist.hasOwnProperty(j)) {
					colors[ $(clist[j]).text() ] = '#'+ $(clist[j]).attr('hex');
				}
			}

			// Loop through all columns.
			for (j in this.columns) {
				if (this.columns.hasOwnProperty(j)) {
					col = this.columns[j];
	
					// Replace all values with their corresponding color values.
					for (k in col.values) {
						if (col.values.hasOwnProperty(k)) {
							col.values[k] = colors.hasOwnProperty( col.values[k] ) ? colors[ col.values[k] ] : '#FF0000';
						}
					}
					
				}
			}
			this.isColorAxis = true;
		},
		
		destroy: function() {
			this.formatter = null;
			while (this.columns.length) {
				this.columns.pop();
			}
		}
	};
}());

// -------------------------------------------------------
// Nodes
// -------------------------------------------------------
BubbleChart.Node = function() {};

// Palette configuration.
BubbleChart.Node.palette = null;
BubbleChart.Node.paletteIndex = 0;
BubbleChart.Node.numColors = 0;

BubbleChart.Node.setPalette = function(palette) {
	BubbleChart.Node.palette = palette;
	BubbleChart.Node.numColors = palette.length;
	BubbleChart.Node.paletteIndex = 0;
};

// Set default palette.
BubbleChart.Node.setPalette([
	"#053769",
	"#4a8fde",
	"#dd7b1a",
	"#91b571",
	"#d4c4a1"
]);

BubbleChart.Node.prototype = {
	index: 0,
	label: "",
	view: null,
	enabled: true,
	visible: true,
	color: "",
	cindex: 0,
	// X, Y, and radius values.
	x: 0,
	y: 0,
	r: 0,
	// Plot percentages.
	px: 0,
	py: 0,
	pz: 0,
	pc: 0,
	// Plot values.
	vx: 0,
	vy: 0,
	vz: 0,
	vc: 0,
	
	// Clears the node display configuration.
	clear: function() {
		if (this.view instanceof jQuery) {
			this.view.remove(); // << Remove SVG/jQuery element.
		} else {
			this.view.parentNode.removeChild(this.view);
		}
		this.view = null;
		this.enabled = true;
		this.visible = true;
	},
	
	// Sets the node color.
	setColor: function () {
		this.cindex = BubbleChart.Node.paletteIndex++ % BubbleChart.Node.numColors;
		this.color = BubbleChart.Node.palette[ this.cindex ];
	},
	
	// Resets the node configuration values.
	reset: function(index, label) {
		this.index = index;
		this.label = label;
		this.setColor();
	}
};

// -------------------------------------------------------
// Display
// -------------------------------------------------------
BubbleChart.Display = function(chart) {
	var opts = chart.options,
		hasSvg = (!!document.createElementNS && !!document.createElementNS(this.svgNS, 'svg').createSVGRect),
		self = this;

	this.chart = chart;
	this.view = $('<div/>')
		.addClass('bc-display')
		.width(opts.graphWidth)
		.height(opts.graphHeight)
		.appendTo(opts.renderTo);
	this.tooltip = $('<div/>').addClass('bc-display-tooltip').hide();
	this.html = (opts.renderer === 'html' || !hasSvg);
	this.tooltipFormat = (opts.tooltipFormat ? opts.tooltipFormat : function(n) { return n.label; }); 
	
	if (this.html) {
		this.paper = this.view;
	} else {
		this.paper = document.createElementNS(this.svgNS, 'svg');
		this.paper.setAttribute('xmlns', this.svgNS);
		this.paper.setAttribute('version', '1.1');
		this.view[0].appendChild(this.paper);
	}
	
	// Bind mousemove tooltip tracker.
	this.view.mousemove(function(evt) {
		self.updateTooltip(evt.pageX, evt.pageY, true);
	});
	
	opts = null;
};

// Rectangle definition.
BubbleChart.Display.rect = function(x, y, w, h) {
	return {
		x:x,
		y:y,
		width:w,
		height:h
	};
};

BubbleChart.Display.prototype = {
	svgNS: 'http://www.w3.org/2000/svg',
	enabled: false,
	chart: null,
	view: null,
	paper: null,
	html: false,
	graphYear: '',
	graphRect: null,
	headerText: null,
	subheadText: null,
	labelTextX: null,
	labelTextY: null,
	tooltip: null,
	tooltipFormat: null,
	topNode: -1,
	scrub:0,
	
	// Clears the bubble chart display.
	clear: function() {
		$(this.paper).empty();
		this.tooltip.hide();
		this.topNode = -1;
		this.graphYear = '';
		this.scrub = 0;
		this.headerText = null;
		this.subheadText = null;
		this.labelTextX = null;
		this.labelTextY = null;
		this.enabled = false;
	},
	
	// Resets the bubble chart display with new model configuration.
	reset: function() {
		var i,
			model = this.chart.model,
			nodes = this.chart.nodes,
			opts = this.chart.options,
			node;
		
		if (this.enabled) {
			this.clear();
		}
		
		if (this.chart.loaded()) {
			this.drawGraph();

			for (i in nodes) {
				if (nodes.hasOwnProperty(i)) {
					node = nodes[i];
					
					// Create node display.
					if (this.html) {
						// Create HTML bubble.
						node.view = $('<img/>')
							.appendTo(this.paper)
							.attr({
								src: opts.nodeImage.replace('{#}', node.cindex),
								alt: ''
							});
					} else {
						// Create SVG bubble.
						node.view = document.createElementNS(this.svgNS, 'circle');
						node.view.setAttribute('style', 'stroke:none;opacity:0.6;fill:'+ node.color +';');
						node.view.setAttribute('data-label', node.label);
						this.paper.appendChild(node.view);
					}
				}
			}
			
			// calculate minimum and maximum bubble area values.
			model = nodes = opts = null;
			this.enabled = true;
			this.tooltip.appendTo(this.view);
			this.update(0);
		}
	},
	
	update: function(scrub) {
		if (!this.enabled) {
			return;
		}
		scrub = isNaN(scrub) ? this.scrub : scrub;
		
		var model = this.chart.model,
			nodes = this.chart.nodes,
			year = model.axisX.getYear(scrub),
			areaMin = model.minRadius * model.minRadius,
			areaDelta = model.maxRadius * model.maxRadius - areaMin,
			area,
			node,
			visible,
			j;
		
		// PLOT BUBBLES.
		model.axisX.setPosition(scrub);
		model.axisY.setPosition(scrub);
		model.axisZ.setPosition(scrub);
		model.axisC.setPosition(scrub);

		for (j=nodes.length-1; j >= 0; j--) {
			node = nodes[j];
			visible = false;

			if (node.enabled) {
				// calculate values to determin if node is relevant to all axes.
				model.axisX.setNodeData(node);
				model.axisY.setNodeData(node);
				model.axisZ.setNodeData(node);
				visible = (!isNaN(node.px) && !isNaN(node.py) && !isNaN(node.pz));

				// Show node when made newly visible.
				if (visible && !node.visible) {
					if (this.html) {
						node.view.show(); // << Show jQuery
					} else {
						node.view.removeAttribute('visibility');
					}
					node.visible = true;
				}
			}

			if (node.enabled && visible) {
				// Render visible node.
				node.x = this.graphRect.x + (this.graphRect.width * node.px);
				node.y = this.graphRect.y + (this.graphRect.height * node.py);
				node.r = Math.sqrt((areaMin + areaDelta * node.pz) / Math.PI);
				
				// Update node graphic.
				if (this.html) {
					// Update HTML node.
					node.view.css({
						height:(node.r * 2),
						left:(node.x-node.r),
						top:(node.y-node.r),
						width:(node.r * 2)
					});
				} else {
					// Update SVG node.
					node.view.setAttribute('cx', node.x);
					node.view.setAttribute('cy', node.y);
					node.view.setAttribute('r', node.r);
				}
				
			} else if (node.visible) {
				// Bubble is disabled and needs to be hidden.
				if (this.html) {
					node.view.hide();
				} else {
					node.view.setAttribute('visibility', 'hidden');
				}
				node.visible = false;
			}
		}
		
		// Set chart title with current year (when changed).
		if (year !== this.graphYear) {
			this.graphYear = year;
			year = (model.title ? model.title.toUpperCase()+" " : "") + year;
			
			if (this.html) {
				this.headerText.text( year );
			} else {
				this.headerText.firstChild.nodeValue = year;
			}
		}

		model = nodes = null;
		this.scrub = scrub;
	},
	
	// Normalizes the value interval of graph ticks (adapted from HighCharts).
	normalizeTicks: function(interval, multiples) {
		var magnitude,
			normalized,
			decimals = (interval < 1),
			isLog = false,
			i;

		// round to a tenfold of 1, 2, 2.5 or 5
		magnitude = multiples ? 1 : Math.pow(10, Math.floor(Math.log(interval) / Math.LN10));
		normalized = interval / magnitude;

		// multiples for a linear scale
		if (!multiples) {
			multiples = [1, 2, 2.5, 5, 10];
			//multiples = [1, 2, 2.5, 4, 5, 7.5, 10];

			// the allowDecimals option
			if (decimals === false || isLog) {
				if (magnitude === 1) {
					multiples = [1, 2, 5, 10];
				} else if (magnitude <= 0.1) {
					multiples = [1 / magnitude];
				}					
			}
		}

		// normalize the interval to the nearest multiple
		for (i = 0; i < multiples.length; i++) {
			interval = multiples[i];
			if (normalized <= (multiples[i] + (multiples[i+1] || multiples[i])) / 2) {
				break;
			}
		}

		// multiply back to the correct magnitude
		return interval * magnitude;
	},
	
	// Draws the graph.
	drawGraph: function() {
		// Layout params
		var model = this.chart.model,
			cw = this.view.width(),
			ch = this.view.height(),
			m = (this.chart.options.margin || 0), // margin
			p = (this.chart.options.padding || 5), // padding
			gt = m, // graph top
			gr = cw-m, // graph right
			gb = ch-m, // graph bottom
			gl = m, // graph left
			gw = 0, // graph width (must be solved for)
			gh = 0, // graph height (must be solved for)
			inset = model.maxRadius+2,
			// Layout elements
			ticksX = [],
			ticksY = [],
			bbox,
			// Tick layout params (initially configured for the Y-axis)
			tickFormat = {format:model.axisY.format},
			tickInterval = this.normalizeTicks( model.axisY.getValueRange()/5 ),
			tickMin = Math.floor(model.axisY.getMinValue() / tickInterval) * tickInterval,
			tickMax = Math.ceil(model.axisY.getMaxValue() / tickInterval) * tickInterval,
			tickSpanX = 0,
			tickSpanY = 0,
			tickValue = tickMin,
			tick,
			rule,
			pos,
			ele,
			i;
		
		// Creates an SVG style string for text elements.
		function textStyle(size, color, anchor, bold) {
			var style = 'font-family:arial,helvetica,sans-serif;font-size:{size}px;color:{color};text-anchor:{anchor};';
			if (bold) {
				style += 'font-weight:bold;';
			}
			return style.replace('{size}', size).replace('{color}', color).replace('{anchor}', anchor);
		}
		
		// CREATION PASS
		// Start by clearing the paper of any existing drawing.
		if (this.html) {
			this.paper.empty();
		} else {
			//$(this.paper).empty();
			ele = document.createElementNS(this.svgNS, 'rect');
			ele.setAttribute('x', 0);
			ele.setAttribute('y', 0);
			ele.setAttribute('width', cw);
			ele.setAttribute('height', ch);
			ele.setAttribute('style', 'fill:#fff;');
			this.paper.appendChild(ele);
		}
		
		// Y-label.
		if (model.axisY.title) {
			if (this.html) {
				this.labelTextY = $('<span/>')
					.text(model.axisY.title)
					.addClass('axisY')
					.width(ch-m*2)
					.appendTo(this.paper);
				
				gl += this.labelTextY.height()+p;
				
				// Apply y-rotation style AFTER performaing layout metrics.
				this.labelTextY.addClass('rotateY');
				
			} else {
				this.labelTextY = document.createElementNS(this.svgNS, 'text');
				this.labelTextY.appendChild( document.createTextNode(model.axisY.title) );
				this.labelTextY.setAttribute('style', textStyle(10, '#000', 'middle'));
				this.labelTextY.setAttribute('transform', 'rotate(-90 0,0)');
				this.paper.appendChild(this.labelTextY);
				gl += this.labelTextY.getBBox().height+p;
			}
		}
		
		// Y-ticks.
		while (tickValue <= tickMax) {
			if (this.html) {
				tick = $('<span/>')
					.text( model.axisY.formatter(tickValue) )
					.addClass('tickY')
					.appendTo(this.paper);
				
				ticksY.push(tick);
				tickSpanY = Math.max(tickSpanY, tick.width()+p);
			} else {
				ele = document.createTextNode( model.axisY.formatter(tickValue) );
				tick = document.createElementNS(this.svgNS, 'text');
				tick.setAttribute('style', textStyle(10, '#666', 'end'));
				tick.appendChild(ele);
				this.paper.appendChild(tick);
				
				ticksY.push(tick);
				tickSpanY = Math.max(tickSpanY, tick.getBBox().width+p);
			}
			tickValue += tickInterval;
		}
		// Match axis range to normalized tick values.
		model.axisY.setMinValue( tickMin );
		model.axisY.setMaxValue( tickMax );
		gl += tickSpanY;
		
		// Graph Header (required display field -- will append year label during updates)
		// Make sure the field has some default text to run through size metrics.
		if (this.html) {
			this.headerText = $('<span/>')
				.html(model.title ? model.title.toUpperCase() : "&nbsp;")
				.addClass('title')
				.appendTo(this.paper);
		} else {
			ele = document.createTextNode( model.title ? model.title.toUpperCase() : "&nbsp;" );
			this.headerText = document.createElementNS(this.svgNS, 'text');
			this.headerText.setAttribute('style', textStyle(10, '#000', 'middle', true));
			this.headerText.appendChild(ele);
			this.paper.appendChild(this.headerText);
		}
		
		// Graph subhead.
		if (model.subhead) {
			if (this.html) {
				this.subheadText = $('<span/>')
					.text(model.subhead)
					.addClass('subhead')
					.appendTo(this.paper);
			} else {
				ele = document.createTextNode(model.subhead);
				this.subheadText = document.createElementNS(this.svgNS, 'text');
				this.subheadText.setAttribute('style', textStyle(10, '#666', 'middle'));
				this.subheadText.appendChild(ele);
				this.paper.appendChild(this.subheadText);
			}
		}
		
		// X-label.
		if (model.axisX.title) {
			if (this.html) {
				this.labelTextX = $('<span/>')
					.text(model.axisX.title)
					.addClass('axisX')
					.appendTo(this.paper);
			} else {
				ele = document.createTextNode(model.axisX.title);
				this.labelTextX = document.createElementNS(this.svgNS, 'text');
				this.labelTextX.setAttribute('style', textStyle(10, '#000', 'middle'));
				this.labelTextX.appendChild(ele);
				this.paper.appendChild(this.labelTextX);
			}
		}
		
		// X-ticks.
		tickFormat.format = model.axisX.format;
		tickInterval = this.normalizeTicks(model.axisX.getValueRange()/5);
		tickMin = Math.floor(model.axisX.getMinValue() / tickInterval) * tickInterval;
		tickMax = Math.ceil(model.axisX.getMaxValue() / tickInterval) * tickInterval;
		tickValue = tickMin;
		
		// Match axis range to normalized tick values.
		model.axisX.setMinValue(tickMin);
		model.axisX.setMaxValue(tickMax);
		
		while (tickValue <= tickMax) {
			if (this.html) {
				tick = $('<span/>')
					.text( model.axisX.formatter(tickValue) )
					.addClass('tickX')
					.appendTo(this.paper);
				
				ticksX.push(tick);
				tickSpanX = Math.max(tickSpanX, tick.height());
			} else {
				ele = document.createTextNode( model.axisX.formatter(tickValue) );
				tick = document.createElementNS(this.svgNS, 'text');
				tick.setAttribute('width', 50);
				tick.setAttribute('style', textStyle(10, '#666', 'middle'));
				tick.appendChild(ele);
				this.paper.appendChild(tick);

				ticksX.push(tick);
				tickSpanX = Math.max(tickSpanX, tick.getBBox().height);
			}
			tickValue += tickInterval;
		}
		
		// LAYOUT PASS
		
		// Solve for graph width (horizontal subtractions have been performed).
		gw = gr-gl;
		
		// Layout header.
		if (this.headerText) {
			if (this.html) {
				this.headerText.css({
					left:gl,
					top:gt,
					width:gw
				});
				gt += Math.ceil(this.headerText.height())+p;
			} else {
				bbox = this.headerText.getBBox();
				this.headerText.setAttribute('x', gl+Math.round(gw/2));
				this.headerText.setAttribute('y', Math.round(gt+bbox.height/2));
				this.headerText.setAttribute('width', gw);
				gt += Math.ceil(bbox.height)+p;
			}
		}
		
		// Layout subhead.
		if (this.subheadText) {
			if (this.html) {
				this.subheadText.css({
					left:gl,
					top:gt,
					width:gw
				});
				gt += Math.ceil(this.subheadText.height())+p;
			} else {
				bbox = this.subheadText.getBBox();
				this.subheadText.setAttribute('x', gl+Math.round(gw/2));
				this.subheadText.setAttribute('y', Math.round(gt+bbox.height/2));
				this.subheadText.setAttribute('width', gw);
				gt += Math.ceil(bbox.height)+p;
			}
		}
		
		// Add an extra space for bubble inset after the headers.
		gt += inset;
		
		// Layout X-label.
		if (this.labelTextX) {
			if (this.html) {
				this.labelTextX.css({
					left:gl,
					top:gb-this.labelTextX.height(),
					width:gw
				});
				gb -= Math.ceil(this.labelTextX.height());
			} else {
				bbox = this.labelTextX.getBBox();
				this.labelTextX.setAttribute('x', gl+Math.round(gw/2));
				this.labelTextX.setAttribute('y', Math.round(gb-bbox.height/2));
				this.labelTextX.setAttribute('width', gw);
				gb -= Math.ceil(bbox.height);
			}
		}
		// Remove additional space for padding, ticks, and bubble inset above the X-label.
		gb -= (p + tickSpanX + inset);

		// Now solve for graph height (vertical subtractions have been performed).
		gh = gb-gt;
		
		// Layout Y-label.
		if (this.labelTextY) {
			if (this.html) {
				this.labelTextY.css({
					left:m,
					top:ch-m
				});
			} else {
				bbox = this.labelTextY.getBBox();
				this.labelTextY.setAttribute('x', Math.round(m+bbox.height/2));
				this.labelTextY.setAttribute('y', gt+Math.round(gh/2));
				this.labelTextY.setAttribute('width', gh);
			}
		}
		
		// Layout Y-ticks.
		for (i in ticksY) {
			if (ticksY.hasOwnProperty(i)) {
				tick = ticksY[i];
				pos = gb-Math.round(gh*i/(ticksY.length-1));
			
				if (this.html) {
					tick.css({
						display:'block',
						left:gl-p-tickSpanY,
						top:pos-tick.height()/2,
						width:tickSpanY
					});
					rule = $('<span/>')
						.addClass('ruleY')
						.css({
							borderColor:(parseInt(i, 10) < 1 ? '#c0d0e0' : '#c0c0c0'),
							left:gl,
							top:pos,
							width:gw
						})
						.appendTo(this.paper);
				} else {
					tick.setAttribute('x', gl-p);
					tick.setAttribute('y', pos);

					ele = document.createElementNS(this.svgNS, 'line');
					ele.setAttribute('x1', gl);
					ele.setAttribute('y1', pos);
					ele.setAttribute('x2', gl+gw-1);
					ele.setAttribute('y2', pos);
					ele.setAttribute('style', 'stroke-width:1;stroke:'+(parseInt(i, 10) < 1 ? '#c0d0e0' : '#c0c0c0')+';');
					this.paper.appendChild(ele);
				}
			}
		}
		
		// Now reduce X-axis scale to include bubble inset.
		gl += inset;
		gr -= inset;
		gw = gr-gl;
		
		// Layout X-ticks.
		for (i in ticksX) {
			if (ticksX.hasOwnProperty(i)) {
				tick = ticksX[i];
				pos = gl + Math.round(gw*i/(ticksX.length-1));
			
				if (this.html) {
					tick.css({
						left:pos-(tick.width()/2),
						top:gb+inset
					});
					rule = $('<span/>')
						.addClass('ruleX')
						.css({
							left:pos,
							top:gb,
							height:Math.ceil(inset*0.75),
							width:1
						})
						.appendTo(this.paper);
				} else {
					tick.setAttribute('x', pos);
					tick.setAttribute('y', gb+inset+tick.getBBox().height/2);
					
					ele = document.createElementNS(this.svgNS, 'line');
					ele.setAttribute('x1', pos);
					ele.setAttribute('y1', gb);
					ele.setAttribute('x2', pos);
					ele.setAttribute('y2', gb+Math.ceil(inset*0.75));
					ele.setAttribute('style', 'stroke-width:1;stroke:#c0d0e0;');
					this.paper.appendChild(ele);
				}
			}
		}
		
		// Set graphing bounds and clear object references.
		this.graphRect = BubbleChart.Display.rect(gl, gb, gw, -gh);
		model = ele = tick = rule = null;
	},
	
	// Updates the tooltip label and position based on closes node to mouse coordinates.
	updateTooltip: function(mx, my, global) {
		var offset,
			bestTarget,
			bestOffset,
			mathSqRt,
			mathAbs,
			nodes,
			node,
			a,
			b,
			i;
		
		if (this.enabled) {
			// Localize global coordinates.
			if (global) {
				offset = this.view.offset();
				mx -= offset.left;
				my -= offset.top;
			}
			
			// Localize application references.
			bestOffset = this.chart.model.maxRadius+1;
			nodes = this.chart.nodes;
			mathSqRt = Math.sqrt;
			mathAbs = Math.abs;
			
			// Find nearest node.
			for (i=nodes.length-1; i >= 0; i--) {
				node = nodes[i];
				a = mx - node.x;
				b = my - node.y;

				// Quick test of node fitness: are X and Y offsets each within radius?
				if (node.visible && mathAbs(a) < node.r && mathAbs(b) < node.r) {
					offset = mathSqRt(a*a + b*b);

					// Full test of bubble fitness: is actual offset within radius and better than current best?
					if (offset < node.r && offset < bestOffset) {
						bestOffset = offset;
						bestTarget = node;
					}
				}
			}
			
			// Pushes the current hover element to the top of the display stack.
			// This step is skipped if no hover element is identified, or if target is already surfaced.
			if (bestTarget && bestTarget.view && bestTarget.index !== this.topNode) {
				if (this.html) {
					bestTarget.view.appendTo(this.paper);
				} else {
					bestTarget.view.parentNode.appendChild( bestTarget.view );
				}
				this.topNode = bestTarget.index;
			}
			
			// Update tooltip display.
			if (bestTarget) {
				this.tooltip.html( this.tooltipFormat(bestTarget) ).css({left:mx, top:my-25}).show();
			} else {
				this.tooltip.hide();
			}
			
			// Clear object references.
			nodes = bestTarget = mathSqRt = mathAbs = null;
		}
	},
	
	destroy: function() {
		this.clear();
		this.paper.remove();
		this.view.unbind('mousemove');
		this.view = null;
		this.chart = null;
	}
};

// -------------------------------------------------------
// Controls
// -------------------------------------------------------
BubbleChart.Controls = function(chart) {
	var opts = chart.options,
		self = this;
	
	this.chart = chart;
	this.view = $('<div/>').addClass('bc-controls').appendTo( opts.renderTo );
	
	// Play/pause button.
	this.uiPlayback = $('<div/>')
		.addClass('bc-controls-playback')
		.text('Play')
		.click(function() {
			self.togglePlayback(!self.playing);
		})
		.appendTo(this.view);

	// Timeline control.
	this.uiTimeline = $('<div/>')
		.addClass('bc-controls-timeline')
		.appendTo(this.view);
	
	// Scale timeline to fit the container.
	this.uiTimeline.width( opts.graphWidth - parseInt(this.uiTimeline.css('left'), 10) - 20 );
	
	// Timeline years list.
	this.uiTimelineYears = $('<ul/>')
		.addClass('bc-timeline-years')
		.appendTo(this.uiTimeline)
		.click(function(evt){
			evt.preventDefault();
			self.togglePlayback(false);
			self.scrubToPercent( parseFloat($(evt.target).attr('data-to')) );
		});

	// Timeline range element.
	this.uiTimelineRange = $('<div/>')
		.addClass('bc-timeline-scrub-range')
		.appendTo(this.uiTimeline)
		.mousedown(function(evt){
			evt.preventDefault();
			
			if (self.chart.loaded()) {
				// Drag timeline control.
				$(document)
					.bind('mousemove', function(evt) {
						self.scrubToPosition(evt.pageX, true);
					})
					.bind('mouseup',function() {
						$(document)
							.unbind('mousemove')
							.unbind('mouseup');
						self.snapToNearestYear();
					});
				
				// Set new scrub position.
				self.scrubToPosition(evt.pageX, true);
			}
		});

	// Timeline scrub head.
	this.uiTimelineScrub = $('<div/>')
		.addClass('bc-timeline-scrub-head')
		.appendTo(this.uiTimelineRange);
	
	opts = null;
};

BubbleChart.Controls.prototype = {
	chart: null,
	view: null,
	uiPlayback: null,
	uiTimeline: null,
	uiTimelineYears: null,
	uiTimelineRange: null,
	uiTimelineScrub: null,
	playing: false, // Specifies if the timeline is playing.
	position: 0, // Current percent position of playback along the total timeline range.
	pxTotal: 0, // Total pixels of the complete timeline range.
	pxScrubOffset: 0, // Pixel offset of the scrubber image from actual playback position.
	segment: 0, // Percentage value of each timeline segment (whole / number of years)
	totalFrames: 0, // Total number of animation frames rendered across the complete timeline
	currentFrame: 0, // Frame number of current playback position.
	frameTimer: null, // Reference to frame timer interval.
	
	// Clears and disables timeline configuration.
	clear: function() {
		this.uiTimelineScrub.hide();
		this.uiTimelineYears.find('li').remove();
		this.uiPlayback.attr({disabled:"disabled"});
	},
	
	// Resets timeline configuration based on current application model.
	reset: function() {
		var yearInterval,
			numYears,
			even,
			last,
			li,
			i;
		
		if (this.chart.loaded()) {
			numYears = this.chart.model.years.length;
			this.position = 0;
			this.segment = 1 / (numYears-1);
			this.pxTotal = this.uiTimeline.width();
			this.pxScrubOffset = -Math.round(this.uiTimelineScrub.width()/2);
			
			// Calculate total number of animations frames.
			// This is a sliding scale based on number of years.
			// Ranges from 8 to 16 frames per year (more years makes fewer frames per year).
			this.totalFrames = numYears * (8 + Math.round(8 * (1-Math.min(numYears/40, 1))) );
			
			// The interval at which years will be placed along the timeline.
			// Attempts to limit year marks to 1 year for every 35 pixels.
			yearInterval = Math.ceil(35/(this.pxTotal/numYears));

			for (i=0; i < numYears; i++) {

				even = (i % yearInterval === 0); // << year is on even increment.
				last = (i === numYears-1); // << year is last timeline item.

				// Configure and anchor tag with click handler that will update the application timeframe.
				li = $('<li/>')
					.css({left:this.pxTotal*this.segment*i})
					.appendTo(this.uiTimelineYears);

				if (even || (last && this.pxTotal*this.segment > 5)) {
					li.append($('<button/>')
						.text( this.chart.model.years[i] )
						.attr('data-to', this.segment*i));

					if (last && !even) {
						// hang a final uneven item off the end of the timeline.
						li.addClass('hanging');
					}
				}
			}

			this.uiTimelineScrub.show();
			this.uiTimelineRange.width(this.pxTotal-1);
			this.uiPlayback.removeAttr('disabled');
			this.setPosition(this.position);
		}
	},
	
	// Specifies if the controller is currently playing as an animation.
	isPlaying: function() {
		return this.playing;
	},
	
	// Gets and sets the current percent-position of the scrubber, expressed as a number 0-1.
	getPosition: function() {
		// return Math.max(0, Math.min((timelineHead.position().left-_pxScrubOffset)/this.pxTotal, 1)); // << brute force calculation.
		return this.position;
	},
	setPosition: function(perc) {
		this.uiTimelineScrub.css({left: Math.round(this.pxTotal*perc)+this.pxScrubOffset });
		this.position = perc;
	},
	
	// Sets the current animation frame display.
	setAnimFrame: function() {
		var perc = this.currentFrame / this.totalFrames,
			self = this;
		
		if (perc >= 1) {
			this.togglePlayback(false); // stop playback.
			// this.currentFrame = 0; // loop playback.
		}

		this.setPosition(perc);
		this.chart.display.update(perc);
		this.currentFrame++;
		
		if (this.playing) {
			this.frameTimer = setTimeout(function() {
				self.setAnimFrame();
				self = null;
			}, 1000/24);
		}
	},
	
	// Starts/stops animation playback.
	togglePlayback: function(enable) {
		enable = (enable || false);

		if (!enable && this.playing) {
			// STOP animation.
			clearTimeout( this.frameTimer );
			this.uiPlayback.html('Play').toggleClass('playing', false);
			this.snapToNearestYear(true);
			this.playing = false;
			
		} else if (enable && !this.playing) {
			// START animation.
			var perc = this.getPosition();
			this.currentFrame = (perc >= 1 ? 0 : Math.round(this.totalFrames * perc));
			this.uiPlayback.html('Stop').toggleClass('playing', true);
			this.playing = true; // << Flag as playing BEFORE starting animation.
			this.setAnimFrame();
		}
	},
	
	// Scrubs to a specific percent-position to the total timeline range.
	scrubToPercent: function(perc) {
		this.currentFrame = Math.floor(this.totalFrames * perc);
		this.setPosition(perc);
		this.chart.display.update(perc);
	},
	
	// Scrubs to a specific pixel-position along the total timeline range.
	scrubToPosition: function(mx, global) {
		if (global) {
			mx = mx - this.uiTimelineRange.offset().left;
		}
		this.scrubToPercent( Math.max(0, Math.min(mx, this.pxTotal)) / this.pxTotal );
	},
	
	// Snaps the scrubber to the nearest year tick.
	snapToNearestYear: function(forward) {
		var i = this.position / this.segment;
		i = (forward || false) ? Math.ceil(i) : Math.round(i);
		this.scrubToPercent( this.segment*i );
	},
	
	destroy: function() {
		// Remove UI elements.
		this.view.remove();
		this.uiPlayback.remove();
		this.uiTimeline.remove();
		this.uiTimelineYears.remove();
		this.uiTimelineRange.remove();
		this.uiTimelineScrub.remove();
		
		// Purge component references.
		this.view = null;
		this.uiPlayback = null;
		this.uiTimeline = null;
		this.uiTimelineYears = null;
		this.uiTimelineRange = null;
		this.uiTimelineScrub = null;
		this.chart = null;
	}
};

// -------------------------------------------------------
// Utilities
// -------------------------------------------------------
BubbleChart.utils = (function() {
	return {
		// Utility method for parsing CSV data.
		parseCSV: function(csv, delimiter) {
		    delimiter = (delimiter || ",");

		    var pattern = new RegExp(
					("(\\" + delimiter + "|\\r?\\n|\\r|^)" +
		            "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
		            "([^\"\\" + delimiter + "\\r\\n]*))"), "gi"),
				data = [[]],
				matches = null,
				val,
				d;

		    while (matches = pattern.exec( csv )){
				d = matches[ 1 ];
				if (d.length && (d !== delimiter)) {
					data.push( [] );
				}
				if (matches[ 2 ]) {
					val = matches[ 2 ].replace(new RegExp( "\"\"", "g" ), "\"");
				} else {
					val = matches[ 3 ];
				}
				data[ data.length - 1 ].push( val );
		    }
		    return data;
		},

		// Utility method used to format numbers with commas.
		formatNumber: function(nStr, format) {
			nStr += '';
			var x = nStr.split('.'),
				x1 = x[0],
				x2 = x.length > 1 ? '.' + x[1] : '',
				rgx = /(\d+)(\d{3})/;
			while (rgx.test(x1)) {
				x1 = x1.replace(rgx, '$1' + ',' + '$2');
			}
			return x1 + x2;
		}
	};
}());

// Close component scope...
}());
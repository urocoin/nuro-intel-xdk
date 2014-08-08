/*
 * Copyright (C) 2013-2014 Intel Corporation. All rights reserved.
 */

/*
 * This script initializes JustGage widgets within your app
 *
 *
 * All JustGage widgets are exposed through a global object: window.Gauges,
 * and may be retrieved via its `getById` method:
 *
 *   var gauge = Gauges.getById('fuel');
 *
 *
 * To update the value of a gauge:
 *
 *   gauge.refresh(50);
 *
 *
 * Methods on the `Gauges` object:
 *
 *   Gagues.getById(String) - returns a JustGage object
 *   Gauges.forEachNode(Function) - passes each container node to a function
 *   Gauges.forEachWidget(Function) - passes each JustGage object to a function
 *   Gauges.initAllNodes(Boolean) - initialize all container nodes with JustGage
 *   Gauges.preinit() - user-defined function to execute before init
 *
 *
 * For more information, see the JustGage documentation:
 *   http://justgage.com
 *   https://github.com/toorshia/justgage
 */

(function(JustGage) {
  'use strict';

  var gaugeWidgets = {};
  window.Gauges = window.Gauges || {};

  /**
   * Attempt to parse the entirety of a value to a float
   *
   * @param {Mixed} val - something to attempt to parse as a float
   * @return {Float | Mixed} a float value or the original value
   */
  var parse_possible_float = function(val) {
    var strVal = (val + '').trim();

    var parsed = parseFloat(strVal);
    return parsed.toString() === strVal ? parsed : val;
  };

  /**
   * Swap double-quotes and single-quotes
   *
   * @param {String} str - input string
   * @return {String} `str` with swapped quotes
   */
  var from_quote = function(str) {
    return (typeof str !== 'string') ? '' :
      str.replace(/"/g, '\\"').replace(/([^\\])'/g, '$1"').replace(/\\'/g, "'");
  };

  /**
   * Initialize a single JustGage container node
   *
   * @param {DOMNode} gaugeNode - a JustGage container node
   * @param {Boolean} reset - if true, do not reuse existing values
   */
  var init_gauge = function(gaugeNode, reset) {
    var attrs = Array.prototype.slice.call(gaugeNode.attributes);
    var gaugeOptions = {};

    try {
      var dataGauge = gaugeNode.getAttribute('data-gauge');
      gaugeOptions = JSON.parse(from_quote(dataGauge) || '{}');
    } catch(err) { // invalid JSON in data attribute
      return;
    }

    gaugeOptions.id = gaugeNode.getAttribute('id');
    gaugeOptions.title = gaugeOptions.title || ' ';

    gaugeNode.innerHTML = '';

    // re-initialize to current value if widget already exists
    if (!reset && gaugeWidgets[gaugeOptions.id] instanceof JustGage) {
      gaugeOptions.value = gaugeWidgets[gaugeOptions.id].config.value;
    }

    gaugeOptions.value = gaugeOptions.value || 0;
    gaugeWidgets[gaugeOptions.id] = new JustGage(gaugeOptions);
  };

  Gauges.getById = function(id) {
    return gaugeWidgets[id] instanceof JustGage ? gaugeWidgets[id] : null;
  };

  /**
   * Execute a function on each JustGage container node present in the DOM
   *
   * @param {Function} fn - function which is passed each container DOMNode
   */
  Gauges.forEachNode = function(fn) {
    var gaugeNodes = document.getElementsByClassName('uib-justgage');
    Array.prototype.slice.call(gaugeNodes).forEach(fn);
  };

  /**
   * Execute a function on each JustGage widget object
   *
   * @param {Function} fn - function which is passed each JustGage object
   */
  Gauges.forEachWidget = function(fn) {
    Array.prototype.slice.call(gaugeWidgets).forEach(fn);
  };

  /**
   * Init all JustGage container nodes
   *
   * @param {Boolean} reset - if true, do not reuse existing values
   */
  Gauges.initAllNodes = function(reset) {
    Gauges.forEachNode(function(gaugeNode) {
      init_gauge(gaugeNode, reset);
    });
  };
    
    
    

  /**
   * init is called on the `document.DOMContentLoaded`, `window.resize`,
   * and `document.reinit-justgage` events. By default, it just (re)initializes
   * all JustGage container nodes.
   *
   * This preinit function (if defined) will execute just before
   * Gauges.initAllNodes, if needed
   */
  // Gauges.preinit = function() {}

  var init = function(e) {
    if (typeof Gauges.preinit === 'function') { Gauges.preinit(); }
    Gauges.initAllNodes(!!(e.detail && e.detail.reset));
  };

  document.addEventListener('reinit-justgage', init, false);

  if(window.data_support)
  {
      window.data_support.ready(init);
  }
  else
  {
      if (document.readyState !== 'complete') 
      {
        document.addEventListener('DOMContentLoaded', init, false);
        window.addEventListener('resize', init, false);
      }
      else{ init({});   }
  }

})(window.JustGage);

/* dc-lite : fait fonctionner les pages exportées du canevas Gadomi (aperçu uniquement). */
(function () {
  'use strict';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var EV = { onclick: 'click', onkeydown: 'keydown', onmousedown: 'mousedown', onblur: 'focusout', onchange: 'change' };

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (o) {
    var n = typeof o === 'function' ? o(this.state) : o;
    for (var k in n) this.state[k] = n[k];
    if (this.__render) this.__render();
  };
  window.DCLogic = DCLogic;

  function get(scope, path) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function str(v) { return v == null || v === false ? '' : String(v); }

  function boot() {
    var tpl = document.getElementById('dc-tpl');
    var code = document.getElementById('dc-code');
    var root = document.getElementById('dc-root');
    if (!tpl || !root) return;
    var Component;
    if (code) { Component = new Function('DCLogic', code.textContent + '\nreturn Component;')(DCLogic); }
    else { Component = function () { DCLogic.call(this); }; Component.prototype = Object.create(DCLogic.prototype); Component.prototype.renderVals = function () { return {}; }; }
    var comp = new Component({});
    var handlers = {}, hid = 0;

    function build(src, scope, out) {
      for (var n = src.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.nodeValue.replace(HOLE, function (_, p) { return str(get(scope, p)); }))); continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName.toLowerCase();
        if (tag === 'sc-if') {
          var m = /\{\{\s*([^}]+?)\s*\}\}/.exec(n.getAttribute('value') || '');
          if (m && get(scope, m[1])) build(n.content || n, scope, out);
          continue;
        }
        if (tag === 'sc-for') {
          var lm = /\{\{\s*([^}]+?)\s*\}\}/.exec(n.getAttribute('list') || ''), as = n.getAttribute('as') || 'it';
          var list = lm ? get(scope, lm[1]) : null;
          if (list && list.length) for (var i = 0; i < list.length; i++) {
            var sc = Object.create(scope); sc[as] = list[i]; build(n.content || n, sc, out);
          }
          continue;
        }
        var el = n.namespaceURI === 'http://www.w3.org/2000/svg' ? document.createElementNS(n.namespaceURI, n.tagName) : document.createElement(n.tagName);
        for (var a = 0; a < n.attributes.length; a++) {
          var at = n.attributes[a], name = at.name, val = at.value;
          if (name.indexOf('hint-') === 0) continue;
          if (name.slice(0, 2) === 'on') {
            var hm = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/.exec(val);
            if (hm) { var fn = get(scope, hm[1]); if (typeof fn === 'function') { var id = 'h' + (hid++); handlers[id] = fn; el.setAttribute('data-dc-' + (EV[name] || name.slice(2)), id); } }
            continue;
          }
          el.setAttribute(name, val.replace(HOLE, function (_, p) { return str(get(scope, p)); }));
        }
        build(tag === 'template' ? n.content : n, scope, el);
        out.appendChild(el);
      }
    }

    var first = true;
    function render() {
      handlers = {}; hid = 0;
      var vals = comp.renderVals ? comp.renderVals() : {};
      var frag = document.createElement('div');
      build(tpl.content, vals, frag);
      if (first) { while (frag.firstChild) root.appendChild(frag.firstChild); first = false; return; }
      morphdom(root, frag, {
        childrenOnly: true,
        onBeforeElUpdated: function (from, to) {
          if (from.hasAttribute && from.hasAttribute('data-dc-keep')) return false;
          var t = from.tagName;
          if (t === 'INPUT' && (from.type === 'checkbox' || from.type === 'radio')) { if (!to.hasAttribute('checked')) to.checked = from.checked; }
          else if ((t === 'INPUT' || t === 'TEXTAREA') && !to.hasAttribute('value')) { to.value = from.value; }
          else if (t === 'SELECT' && !to.querySelector('option[selected]') && to.options[from.selectedIndex]) { to.options[from.selectedIndex].setAttribute('selected', ''); }
          return true;
        }
      });
    }
    comp.__render = render;

    function dispatch(type) {
      root.addEventListener(type === 'focusout' ? 'focusout' : type, function (e) {
        var el = e.target;
        while (el && el !== root) {
          var id = el.getAttribute && el.getAttribute('data-dc-' + type);
          if (id && handlers[id]) { handlers[id].call(el, e); return; }
          el = el.parentNode;
        }
      }, type === 'focusout');
    }
    ['click', 'keydown', 'mousedown', 'focusout', 'change'].forEach(dispatch);
    // React : onChange se déclenche à chaque frappe sur les champs texte et les curseurs
    root.addEventListener('input', function (e) {
      var el = e.target, id = el.getAttribute && el.getAttribute('data-dc-change');
      if (id && handlers[id] && el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'radio') { el.__dcInput = true; handlers[id].call(el, e); }
    });
    root.addEventListener('change', function (e) {
      var el = e.target; if (el.__dcInput) { el.__dcInput = false; e.stopImmediatePropagation(); }
    }, true);

    render();
  }
  boot();
})();

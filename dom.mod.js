"use strict";function _toConsumableArray(e){if(Array.isArray(e)){for(var t=0,n=Array(e.length);t<e.length;t++)n[t]=e[t];return n}return Array.from(e)}function _classCallCheck(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}var _typeof="function"==typeof Symbol&&"symbol"==typeof Symbol.iterator?function(e){return typeof e}:function(e){return e&&"function"==typeof Symbol&&e.constructor===Symbol&&e!==Symbol.prototype?"symbol":typeof e},_createClass=function(){function e(e,t){for(var n=0;n<t.length;n++){var r=t[n];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,r.key,r)}}return function(t,n,r){return n&&e(t.prototype,n),r&&e(t,r),t}}();window.require=function e(t,n,r){function o(i,c){if(!n[i]){if(!t[i]){var l="function"==typeof require&&require;if(!c&&l)return l(i,!0);if(a)return a(i,!0);var u=new Error("Cannot find module '"+i+"'");throw u.code="MODULE_NOT_FOUND",u}var f=n[i]={exports:{}};t[i][0].call(f.exports,function(e){var n=t[i][1][e];return o(n||e)},f,f.exports,e,t,n,r)}return n[i].exports}for(var a="function"==typeof require&&require,i=0;i<r.length;i++)o(r[i]);return o}({"iqwerty-dom":[function(require,module,exports){var iqwerty=iqwerty||{},Component=function(){function e(){var t=this;_classCallCheck(this,e),this.$iq={template:""};var n=Array.from(Object.getOwnPropertyNames(window)),r=Object.getOwnPropertyNames(Object.getPrototypeOf(this));n.forEach(function(e){-1===r.indexOf(e)&&Object.defineProperty(t,e,{value:void 0,configurable:!0,writable:!0})})}return _createClass(e,[{key:"$iqOnMount",value:function(){}},{key:"$iqOnChange",value:function(){}}]),e}(),DOM_PAGE_LOADED=new Promise(function(e){document.addEventListener("DOMContentLoaded",function(){e()}),"interactive"!==document.readyState&&"complete"!==document.readyState||e()});DOM_PAGE_LOADED.then(function(){iqwerty.dom.Load(document.body)}),iqwerty.dom=function(){function _toPascalCase(e){return e.replace(/-([a-z])/g,function(e){return e[1].toUpperCase()}).replace(/^[a-z]/,function(e){return e.toUpperCase()})}function _templateLoader(){return function(e){return{for:function(t){return fetch(e).then(function(e){return e.text()}).then(function(e){t[IQ][IQ_MD_TPL]=e})}}}}function _saferEval(e,t){try{return new Function("\n\t\t\t\twith(this) {\n\t\t\t\t\t"+e+"\n\t\t\t\t}\n\t\t\t").call(t)}catch(n){return void console.error(n,"JavaScript couldn't be executed in the given context.\nJavaScript:\n"+e+"\nComponent context:",t)}}function _saferEvalReturn(e,t){return _saferEval("return "+e,t)}function _saferEvalTemplate(e,t){return _saferEval("return `"+e+"`",t)||""}function _saferInstantiateComponent(maybeClassName,componentElement,detector){if(!/[A-Z]/.test(maybeClassName))throw new Error('The class "'+maybeClassName+"\" doesn't seem like a valid class name. Quantum components are recommended to be in PascalCase");var loader=_templateLoader(),inject="{\n\t\t\tdetector: detector,\n\t\t\telementRef: componentElement,\n\t\t\tloadTemplate: loader,\n\t\t}",maybeCtrl=void 0;try{maybeCtrl=eval("new "+maybeClassName+"("+inject+")")}catch(e){throw console.error('Did you remember to create the class "'+maybeClassName+'"?'),new Error(e)}if(!maybeCtrl[IQ])throw new Error('Whoops. Your component name "'+maybeClassName+'" probably conflicts with some JS reserved word.');return maybeCtrl}function _observe(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:function(){};e[IQ_SYM]||(e[IQ_SYM]={}),Object.keys(e).forEach(function(n){"number"!=typeof e[n]&&"string"!=typeof e[n]&&"boolean"!=typeof e[n]&&"object"!==_typeof(e[n])&&void 0!==e[n]||e[IQ_SYM][n]!==e[n]&&(e[IQ_SYM][n]=e[n],Object.defineProperty(e,n,{get:function(){return e[IQ_SYM][n]},set:function(r){r!==e[IQ_SYM][n]&&(e[IQ_SYM][n]=r,t(),_patchObjectMutators(r,t))}}),null!=e[n]&&_patchObjectMutators(e[n],t),"object"===_typeof(e[n])&&_observe(e[n],t))})}function _patchObjectMutators(e,t){var n=e.constructor.name,r=MUTATORS[n];r&&r.forEach(function(n){var r=e[n].bind(e);e[n]=function(){var n=r.apply(void 0,arguments);return t(),_observe(e,t),n}})}function _templatizeBindings(e){var t=new RegExp(BINDING,"g");return e.replace(t,"${$1}")}function _handleFor(e,t){var n=e.dataset[IQ_DIRECTIVE+"for"],r=n.substring(0,n.indexOf(" ")),o=_saferEval("\n\t\t\tconst out = [];\n\t\t\tfor(const "+n+") {\n\t\t\t\tout.push({\n\t\t\t\t\thtml: `"+e.outerHTML+"`,\n\t\t\t\t\tcontext: "+r+",\n\t\t\t\t});\n\t\t\t}\n\t\t\treturn out;\n\t\t",t),a=document.createDocumentFragment();o.forEach(function(e){var n=document.createElement(IQ_CONTAINER);n.innerHTML=e.html;for(var o=n.children[0],i=[o];i.length;){var c=i.pop();c[IQ_SYM]=new Map,c[IQ_SYM].set(IQ_SYM_LOCAL_CXT,new Map),c[IQ_SYM].get(IQ_SYM_LOCAL_CXT).set(r,e.context),i.push.apply(i,_toConsumableArray(c.children))}o.removeAttribute("data-"+IQ_DIRECTIVE+"for"),t[r]=e.context,_evaluateTemplate(o,t),delete t[r],a.appendChild(n.children[0])}),e.innerHTML="";var i=!0,c=!1,l=void 0;try{for(var u,f=e.attributes[Symbol.iterator]();!(i=(u=f.next()).done);i=!0){var _=u.value,d=_.name;e.removeAttribute(d)}}catch(e){c=!0,l=e}finally{try{!i&&f.return&&f.return()}finally{if(c)throw l}}e.parentNode.replaceChild(a,e)}function _handleIf(e,t){if(!_saferEvalReturn(e.dataset[IQ_DIRECTIVE+"if"],t)){var n=document.createComment("iq.if removed node");e.parentNode.replaceChild(n,e)}}function _prepareDirectives(e,t){Object.keys(e.dataset).filter(function(e){return 0===e.indexOf(IQ_DIRECTIVE)}).forEach(function(n){var r=n.replace(IQ_DIRECTIVE,"");if(!IQ_DIRECTIVES.has(r)){e[IQ_SYM]||(e[IQ_SYM]=new Map,e[IQ_SYM].set(IQ_SYM_INPUTS,new Set));var o=_saferEvalReturn(e.dataset[n],t);return e[IQ_SYM].get(IQ_SYM_INPUTS).add(r),void(e[r]=o)}switch(r){case"for":_handleFor(e,t);break;case"if":_handleIf(e,t)}})}function _callIqEvent(e,t,n,r){var o=n[IQ_SYM]&&n[IQ_SYM].get(IQ_SYM_LOCAL_CXT);o&&n[IQ_SYM].get(IQ_SYM_LOCAL_CXT).forEach(function(e,t){r[t]=e}),r[IQ_EVENT_INJECT]=t,_saferEval(n.dataset[e],r),o&&n[IQ_SYM].get(IQ_SYM_LOCAL_CXT).forEach(function(e,t){delete r[t]}),delete r[IQ_EVENT_INJECT]}function _prepareEvents(e,t){Object.keys(e.dataset).filter(function(e){return 0===e.indexOf(IQ_EVENT)}).forEach(function(n){var r=n.replace(IQ_EVENT,"");e.addEventListener(r,function(r){_callIqEvent(n,r,e,t)})})}function _evaluateTemplate(e,t){for(var n=[e];n.length;){var r=n.pop();if(r.nodeType===Node.TEXT_NODE)r.textContent=_saferEvalTemplate(r.textContent,t);else if(r.nodeType===Node.ELEMENT_NODE){_prepareDirectives(r,t),_prepareEvents(r,t);var o=!0,a=!1,i=void 0;try{for(var c,l=r.attributes[Symbol.iterator]();!(o=(c=l.next()).done);o=!0){var u=c.value,f=u.name,_=u.value;if(-1===f.indexOf(IQ_DIRECTIVE)){var d=_saferEvalTemplate(_,t);r.getAttribute(f)!==d&&r.setAttribute(f,d)}}}catch(e){a=!0,i=e}finally{try{!o&&l.return&&l.return()}finally{if(a)throw i}}}n.push.apply(n,_toConsumableArray(r.childNodes))}}function _nodeChanged(e,t){return e.nodeType!==t.nodeType||e.nodeType===Node.TEXT_NODE&&e.textContent!==t.textContent||e.tagName!==t.tagName}function _patchFinalNodeWithData(e,t){var n=!0,r=!1,o=void 0;try{for(var a,i=t.attributes[Symbol.iterator]();!(n=(a=i.next()).done);n=!0){var c=a.value,l=c.name,u=c.value;-1===l.indexOf(IQ_DIRECTIVE)&&(e.getAttribute(l)!==u&&e.setAttribute(l,u))}}catch(e){r=!0,o=e}finally{try{!n&&i.return&&i.return()}finally{if(r)throw o}}if(t[IQ_SYM]&&t[IQ_SYM].get(IQ_SYM_INPUTS)){var f=t[IQ_SYM].get(IQ_SYM_INPUTS),_=!0,d=!1,s=void 0;try{for(var p,m=f[Symbol.iterator]();!(_=(p=m.next()).done);_=!0){var I=p.value;e[I]=t[I]}}catch(e){d=!0,s=e}finally{try{!_&&m.return&&m.return()}finally{if(d)throw s}}}e[IQ_SYM]=t[IQ_SYM]}function _patch(e,t){for(var n=Array.from(e.childNodes),r=Array.from(t.childNodes),o=0;n[o]||r[o];)n[o]?r[o]?_nodeChanged(n[o],r[o])?n[o].parentNode.replaceChild(r[o],n[o]):r[o].nodeType===Node.ELEMENT_NODE&&(_patch(n[o],r[o]),_patchFinalNodeWithData(n[o],r[o])):e.removeChild(n[o]):e.appendChild(r[o]),o++}function Load(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:document.createDocumentFragment(),n=!(arguments.length>2&&void 0!==arguments[2])||arguments[2];Array.from(e.querySelectorAll("*")).concat(e).filter(function(e){return-1!==e.tagName.indexOf("-")}).forEach(function(e){e[IQ_SYM]||(e[IQ_SYM]=new Map,e[IQ_SYM].set(IQ_SYM_INPUTS,new Set),e[IQ_SYM].set(IQ_SYM_LOCAL_CXT,new Map));var r=!0,o=void 0;if(e[IQ_SYM].get(IQ_SYM_CTRL))o=e[IQ_SYM].get(IQ_SYM_CTRL),r=!1;else{var a={ComponentShouldChange:function(){Load(e)}},i=_toPascalCase(e.tagName.toLowerCase());o=_saferInstantiateComponent(i,e,a),e[IQ_SYM].get(IQ_SYM_INPUTS).forEach(function(t){o[t]=e[t]}),e[IQ_SYM].set(IQ_SYM_CTRL,o),_observe(o,function(){a.ComponentShouldChange()})}var c=_templatizeBindings(o[IQ][IQ_MD_TPL]),l=document.createElement(IQ_CONTAINER);l.innerHTML=c;var u=document.createDocumentFragment();Array.from(l.childNodes).forEach(function(e){u.appendChild(e)}),_evaluateTemplate(u,o),_patch(t,u),t.children.length&&Array.from(t.children).forEach(function(e){Load(e,e,!1)}),n&&(_patch(e,t),o.$iqOnChange(),r&&o.$iqOnMount())})}var BINDING="{{(.*?)}}",IQ_SYM=Symbol("$iq"),IQ_SYM_CTRL=Symbol("controller"),IQ_SYM_INPUTS=Symbol("inputs"),IQ_SYM_LOCAL_CXT=Symbol("context"),IQ="$iq",IQ_MD_TPL="template",IQ_CONTAINER="iq-container",IQ_DIRECTIVE="iq.",IQ_DIRECTIVES=new Set(["for","if"]),IQ_EVENT="iq:",IQ_EVENT_INJECT="$iqEvent",MUTATORS=Object.freeze({Array:["copyWithin","fill","pop","push","reverse","shift","sort","splice","unshift"],Map:["clear","delete","set"],Set:["add","clear","delete"]});return{Load:Load}}(),void 0!==module&&(module.exports={Component:Component,dom:iqwerty.dom})},{}]},{},["iqwerty-dom"]);
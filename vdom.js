/***********************************************

  "vdom.js"

  Created by Michael Cheng on 04/30/2018 20:18
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/

'use strict';

var iqwerty = iqwerty || {};

/**
 * A Promise that resolves when the DOM loads.
 */
const PAGE_LOADED = new Promise(resolve => {
	document.addEventListener('DOMContentLoaded', () => {
		resolve();
	});

	if(document.readyState === 'interactive') {
		resolve();
	}
});

PAGE_LOADED.then(() => {
	iqwerty.vdom.Load(document);
});

iqwerty.vdom = (() => {
	const CONTAINER_TAG = 'iq-container';

	const COMPONENT = 'iq-component';
	const COMPONENT_DATASET = 'iqComponent';

	const IQ_EVENT = 'data-iq:';
	const IQ_EVENT_INJECTION = '$iqEvent';

	/**
	 * Used as a property name on a Node to keep track of IQ listeners that are set on the Node.
	 * TODO: Figure out if this is a good thing to do.....
	 * @type {Symbol}
	 */
	const LISTENERS_SYMBOL = Symbol('listeners');

	/**
	 * Used to specify that an IQ component Node has been resolved already and should not be touched anymore by external iqwerty.vdom.Load() calls.
	 * @type {Symbol}
	 */
	const COMPONENT_RESOLVED_SYMBOL = Symbol('componentResolved');

	const BINDING = '\{\{(.*?)\}\}';

	/**
	 * Define a mapping of classes to its mutating methods. This is used for change detection. The framework proxies mutating methods and allows the UI to re-render when a mutating method is used.
	 * This is done because the main solution for change detection here is proxying getters and setters on an object.
	 * @type {Object}
	 */
	const MUTATORS = {
		'Array': [
			'copyWithin',
			'fill',
			'pop',
			'push',
			'reverse',
			'shift',
			'sort',
			'splice',
			'unshift',
		],
		'Map': [
			'clear',
			'delete',
			'set',
		],
		'Set': [
			'add',
			'clear',
			'delete',
		],
	};

	/**
	 * Define a blacklist of global properties that consumers shouldn't be able to use in their template. For example, `location` instead of `window.location`.
	 */
	const BLACKLIST = Object.getOwnPropertyNames(window)
		.reduce((blacklist, prop) => Object.assign(blacklist, {
			[prop]: undefined
		}), {});

	/**
	 * Holds references to all components created by the framework. This allows for global state changes.
	 * @type {Set<Vdom>}
	 */
	const GLOBAL_COMPONENT_REGISTER = new Set();

	/**
	 * Global application state to be injected into components if needed. This is a concept and it may be deleted.
	 * @type {Object}
	 */
	const APPLICATION_STATE = (() => {
		const state = new Map();

		/**
		 * Returns all entries in the global state.
		 * @return {Object}
		 */
		function all() {
			return Array
				.from(state.entries())
				.reduce((obj, [key, value]) => Object.assign(obj, {
					[key]: value
				}), {});
		}

		/**
		 * Create an entry in the global state without rendering changes in the UI. This is useful for initializing application state.
		 */
		function create(key, value) {
			state.set(key, value);
		}

		/**
		 * Update a value in the global state. Renders changes in all components.
		 */
		function update(key, value) {
			state.set(key, value);

			// console.log('performing global update');
			// Perform global update.
			GLOBAL_COMPONENT_REGISTER.forEach(component => {
				component.ComponentShouldChange(true);
			});
		}

		/**
		 * Get an entry from the global state.
		 */
		function get(key) {
			return state.get(key);
		}

		return {
			all,
			create,
			update,
			get,
		};
	})();

	/**
	 * Allow calling mutating methods on objects.
	 * TODO: Determine if this is actually useful/performant.
	 * @param {Object} obj The object whose methods we wish to patch.
	 * @param {Function} action The action to perform when a mutating method is called. Normally, this should be vdom.ComponentShouldChange(true).
	 */
	function __patchAllTheThings(obj, action) {
		const klass = obj.constructor.name;
		const mutators = MUTATORS[klass];

		if(!mutators) {
			return;
		}

		mutators.forEach(method => {
			const original = obj[method].bind(obj);
			obj[method] = (...args) => {
				const ret = original(...args);
				action();
				return ret;
			};
		});
	}

	/**
	 * Noop function used as a default function value when needed.
	 */
	function _noop() {}

	/**
	 * A maybe-safer eval that does not allow global context.
	 * @param {String} js Some JS to evaluate.
	 * @param {Object} context
	 * @return {any|undefined} Returns undefined if the JS couldn't be evaulated in context.
	 */
	function _saferEval(js, context) {
		try {
			// TODO: Maybe don't do with()?
			// jshint evil:true
			return (new Function(`
				with(this) {
					${js}
				}
			`))
			// Note that blacklist should be first, so that context can override it if necessary.
			.call(Object.assign({}, BLACKLIST, context));
		} catch(e) {
			// Some variable couldn't be found in the executed JS (or something like that).
			console.error(e, `JavaScript couldn't be executed in the given context.\nJavaScript:\n${js}\nComponent context:`, context);

			return undefined;
		}
	}

	/**
	 * A maybe-safer eval for evaluating component templates.
	 * @param {String} template Some template string to evaluate.
	 * @param {Object} context
	 * @return {String} An evaluated template string. If the template cannot be evaluated with the context, an empty string is returned.
	 */
	function _saferEvalTemplate(template, context) {
		return _saferEval(`return \`${template}\``, context) || '';
	}

	/**
	 * Observe an object and use the given bindings as storage. If an action is specified, it is called when the object has changes.
	 * @param {Object} obj The object to observe.
	 * @param {Object} bindings The object to store object values in.
	 * @param {Function} action The callback when changes occur.
	 */
	function _observe(obj, bindings, action = _noop) {
		Object.keys(obj).forEach(prop => {
			if(typeof obj[prop] !== 'number' &&
				typeof obj[prop] !== 'string' &&
				typeof obj[prop] !== 'boolean' &&
				typeof obj[prop] !== 'object') {
					// We don't want to do anything with functions or things we can't clone/watch properly.
					return;
			}

			// Set the original value first.
			bindings[prop] = obj[prop];
			Object.defineProperty(obj, prop, {
				get() {
					return bindings[prop];
				},
				set(value) {
					bindings[prop] = value;
					// console.log('re-render now!');
					action();
				}
			});

			// TODO: Determine if this is actually useful/performant.
			__patchAllTheThings(obj[prop], action);

			if(typeof obj[prop] === 'object') {
				_observe(obj[prop], bindings, action);
			}
		});
	}


	// === Begin framework code === //


	/**
	 * The abstract base for virtual things in the virtual DOM in this framework.
	 * @abstract
	 */
	function AbstractVirtualNode() {}

	/**
	 * @abstract
	 * @return {Boolean} Specifies whether or not the node is an IQ component.
	 */
	AbstractVirtualNode.prototype.isComponent = function() {
		throw new Error('isComponent must be implemented.');
	};

	/**
	 * @abstract
	 * @return {Boolean} Specifies whether or not the node contains an IQ event.
	 */
	AbstractVirtualNode.prototype.hasEvent = function() {
		throw new Error('hasEvent must be implemented.');
	};

	/**
	 * Create a DOM node.
	 * @extends {AbstractVirtualNode}
	 * @param {String} tag The node type.
	 * @param {Prop} props A dictionary of node properties and values.
	 * @param {VirtualElement} children An array of VirtualElements that are a child of the current node.
	 * @return {VirtualElement} Returns a VirtualElement.
	 */
	function VirtualElement(tag, props, ...children) {
		this.tag = tag;
		this.props = props;
		this.children = children;
	}

	VirtualElement.prototype = Object.create(AbstractVirtualNode.prototype);

	/**
	 * @override
	 */
	VirtualElement.prototype.isComponent = function() {
		if(!this.props) {
			return false;
		}

		return Array
			.from(this.props.keys())
			.some(prop => prop.indexOf(`data-${COMPONENT}`) === 0);
	};

	/**
	 * @override
	 */
	VirtualElement.prototype.hasEvent = function() {
		if(!this.props) {
			return false;
		}

		return Array
			.from(this.props.keys())
			.some(prop => prop.indexOf(IQ_EVENT) === 0);
	};

	/**
	 * A virtual text DOM node.
	 * @extends {AbstractVirtualNode}
	 * @param {String} text The text stored in the node.
	 */
	function VirtualTextNode(text) {
		this.text = text;
	}

	VirtualTextNode.prototype = Object.create(AbstractVirtualNode.prototype);

	/**
	 * @override
	 */
	VirtualTextNode.prototype.isComponent = () => false;

	/**
	 * @override
	 */
	VirtualTextNode.prototype.hasEvent = () => false;

	/**
	 * Parse a string with the DOMParser into DOM components in memory.
	 * @return {Node} Returns the HTML wrapped in a single component.
	 * @return {Node[]} Returns the array of children in the DocumentFragment.
	 */
	function _parseStringToHtml(html) {
		const content = new DOMParser().parseFromString(html, 'text/html').body;
		const componentRoot = document.createDocumentFragment();
		const children = Array.from(content.childNodes);

		if(children.length && children[0] && children[0].nodeType !== Node.TEXT_NODE) {
			// TODO: Figure out if this really solves the problem.
			// Add an empty text node to the beginning. The problem is that the DOMParser doesn't add the text nodes in the beginning of the string. So if there is a new line before the first element, it doesn't add it to the structure.
			// We add an empty text node here so the VDOM can have the same representation as the real one.
			children.unshift(document.createTextNode(undefined));
		}

		children.forEach(child => {
			componentRoot.appendChild(child);
		});

		return Array.from(componentRoot.childNodes);
	}

	/**
	 * Specifies whether or not the two nodes are different. A VirtualElement or VirtualTextNode may be inputs here.
	 * @param {VirtualElement|VirtualTextNode} newVdom
	 * @param {VirtualElement|VirtualTextNode} oldVdom
	 * @return {Boolean}
	 */
	function _elementChanged(newVdom, oldVdom) {
		if(newVdom instanceof VirtualElement && oldVdom instanceof VirtualElement) {
			return newVdom.tag !== oldVdom.tag;
		} else if(newVdom instanceof VirtualTextNode && oldVdom instanceof VirtualTextNode) {
			return newVdom.text !== oldVdom.text;
		}
		return true;
	}

	/**
	 * Returns true if the VirtualElement is a component.
	 * @param {VirtualElement} vdom
	 * @return {Boolean}
	 */
	// function _isIqComponent(vdom) {
	// 	if(!vdom.props) {
	// 		return false;
	// 	}

	// 	return Array
	// 		.from(vdom.props.keys())
	// 		.some(prop => prop.indexOf(`data-${COMPONENT}`) === 0);
	// }

	/**
	 * Returns true if the VirtualElement includes IQ events.
	 * @param {VirtualElement} vdom
	 * @return {Boolean}
	 */
	// function _hasIqEvent(vdom) {
	// 	if(!vdom.props) {
	// 		return false;
	// 	}

	// 	return Array
	// 		.from(vdom.props.keys())
	// 		.some(prop => prop.indexOf(IQ_EVENT) === 0);
	// }

	/**
	 * Handle events on a VirtualElement. If there are events, it tracks them and sets actual event listeners.
	 * @param {Node} el The actual HTML element associated with the VirtualElement. Event listeners will be set on this element.
	 * @param {VirtualElement} ve
	 * @param {Object} context The context to execute the event handler in. This is normally the component controller.
	 */
	function _handleEvents(el, ve, context) {
		if(!ve.hasEvent()) {
			return;
		}

		// Track listeners set on the element by adding a secret property on it.
		if(el[LISTENERS_SYMBOL] === undefined) {
			el[LISTENERS_SYMBOL] = new Set();
		}

		// Assign event listeners if IQ events are set on the element.
		if(ve.props) {
			const iqEvents = Array
				.from(ve.props.keys())
				.filter(prop => prop.indexOf(IQ_EVENT) === 0);

			iqEvents.forEach(iqEvent => {
				const event = iqEvent.split(IQ_EVENT)[1];

				const fn = (e) => {
					const action = ve.props.get(iqEvent);

					// Inject the event as `$iqEvent`. This can then be used in the event handler.
					context[IQ_EVENT_INJECTION] = e;

					_saferEval(action, context);
				};

				if(!el[LISTENERS_SYMBOL].has(event)) {
					el[LISTENERS_SYMBOL].add(event);
					el.addEventListener(event, fn);
				}
			});
		}
	}

	/**
	 * Patch the given root node with the new DOM.
	 * @param {Object} context The context for parsing and executing IQ events. This should be the component controller.
	 */
	function _patch(root, newVdom, oldVdom, context = {}, childIndex = 0) {
		// console.log(root, newVdom, oldVdom);

		// Parse the vdom to see if any events are there
		// if(newVdom instanceof VirtualElement) {
			_handleEvents(root, newVdom, context);
		// }

		if(!oldVdom) {
			// console.log('adding child');
			root.appendChild(_toElements(newVdom, context));
		} else if(!newVdom) {
			// console.log('removing child');
			root.removeChild(root.childNodes[childIndex]);
		} else if(_elementChanged(newVdom, oldVdom)) {
			// console.log('replacing child');
			root.replaceChild(
				_toElements(newVdom, context),
				root.childNodes[childIndex]
			);
		// Don't process nested components.
		} else if(newVdom instanceof VirtualElement && !newVdom.isComponent()) {
			// console.log('diffing children');
			const newLength = newVdom.children.length;
			const oldLength = oldVdom.children.length;
			for(let i=0; i<newLength || i<oldLength; i++) {
				_patch(
					root.childNodes[childIndex],
					newVdom.children[i],
					oldVdom.children[i],
					context,
					i
				);
			}
		}
	}

	/**
	 * Transform a node into VirtualElements.
	 * @param {Node} node The HTML node to parse.
	 * @return {VirtualElement}
	 */
	function _toVirtualElements(node) {
		if(node.nodeType === Node.TEXT_NODE) {
			return new VirtualTextNode(node.textContent);
		}

		// Transform the node attributes into a Map of attribute to its value.
		const attrs = new Map(Array.from(node.attributes).map(attr =>
			[attr.name, attr.value]
		));

		const el = new VirtualElement(
			node.nodeName.toLowerCase(),
			attrs,
			...Array.from(node.childNodes).map(_toVirtualElements)
		);

		return el;
	}

	/**
	 * Create real HTML nodes from a VirtualElement.
	 * @param {VirtualElement}
	 * @return {Node}
	 */
	function _toElements(ve, context) {
		if(ve instanceof VirtualTextNode) {
			return document.createTextNode(ve.text);
		}

		const el = document.createElement(ve.tag);

		// Append its children.
		ve.children
			.map(child => _toElements(child, context))
			.forEach(child => {
				el.appendChild(child);
			});

		return el;
	}

	/**
	 * Wraps the component root with iq-container. There may be multiple siblings in the root, so the VirtualElements are later wrapped in a single VirtualElement. The actual root is wrapped in a container too, so that its children match up with the VirtualElements when patching later.
	 * If the component is already wrapped, does nothing.
	 * @param {Node} root The component root.
	 */
	function _wrapComponentIfNeeded(root) {
		if(root.parentNode.tagName.toLowerCase() === CONTAINER_TAG) {
			return;
		}

		// There may be multiple siblings in the root, so the VirtualElements are later wrapped in a single VirtualElement. The actual root is wrapped in a container too, so that its children match up with the VirtualElements when patching later.
		const container = document.createElement(CONTAINER_TAG);
		root.parentNode.insertBefore(container, root);
		container.appendChild(root);
	}

	/**
	 * Parse and execute binding syntax i.e. {{text}} within the template.
	 * @param {String} html
	 * @param {Object} context Some context to parse HTML with.
	 * @return {String} The HTML after executing bindings.
	 */
	function _parseBindings(html, context) {
		const regex = new RegExp(BINDING, 'g');

		// String builder;
		let sb = '';

		let prevIdx = 0;
		let match;
		while((match = regex.exec(html))) {
			const variable = match[1];
			sb += html.substring(prevIdx, match.index);
			sb += `\${${variable}}`;
			prevIdx = match.index+match[0].length;
		}

		// Add the final bits of text to the end.
		sb += html.substring(prevIdx, html.length);
		// Woot, we're done! Eval the string within and return it.
		return _saferEvalTemplate(sb, context);
	}

	/**
	 * Update and patch the page with the given HTML.
	 */
	function Render(html) {
		const root = this.componentRoot;
		_wrapComponentIfNeeded(root);

		// Because everything is wrapped, the root node must be the container, which is the wrapper of the root.
		const newRootNode = root.parentElement;

		// Keep the original template so we can use it later again?
		this._originalTemplate = html;

		// Before parsing into HTML, parse and execute the bindings??
		// It must be called with the component controller as context, because the bindings use the controller.
		html = _parseBindings(html, this._controller);

		const newVdom = _parseStringToHtml(html).map(_toVirtualElements);
		const oldVdom = this._currentState || _parseStringToHtml(root.innerHTML).map(_toVirtualElements);

		// Wrap the old and new nodes in a container. This is because we may have multiple siblings in the root, but patching algo only works on 1 root node.
		const newNode = new VirtualElement(undefined, undefined, ...newVdom);
		const oldNode = new VirtualElement(undefined, undefined, ...oldVdom);

		// Now we can patch the DOM.
		_patch(newRootNode, newNode, oldNode, this._controller);

		// Remember to update the current state lol. Otherwise further patches will be against the first render.
		this._currentState = newVdom;
	}

	/**
	 * Notifies that the component should update the UI in response to changes.
	 * @param {Boolean} _changeDetectedByFramework By default, the change was not detected by the framework. The user had to manually call ComponentShouldChange, meaning that the framework did not know how to handle that specific case of changes.
	 * In the case of proxied getter/setters, this means the variable was mutated without getting or setting, such as pushing to an array instead of reassigning to a concat'd one.
	 */
	function ComponentShouldChange(_changeDetectedByFramework = false) { // omg this works?!
		if(!_changeDetectedByFramework) {
			console.warn('Automatic change detection is triggered by reassigning a value - such as concatenating instead of pushing to an array. Some mutating methods are allowed in this framework (see MUTATORS). Use of vdom.ComponentShouldChange() is allowed, but discouraged.');
		}

		this.Render(this._originalTemplate);
	}

	function Vdom(componentRoot) {
		/**
		 * The controller for the component.
		 * @type {Function}
		 */
		this._controller;

		/**
		 * The current state of the DOM, as VirtualElements.
		 * @type {VirtualElement[]}
		 */
		this._currentState;

		/**
		 * The original template of the component.
		 * @type {String}
		 */
		this._originalTemplate;

		/**
		 * The HTML element of the component root.
		 * @type {Node}
		 */
		this.componentRoot = componentRoot;
	}

	Vdom.prototype = {
		Render,
		ComponentShouldChange
	};

	/**
	 * Resolves a component by initializing and creating a virtual DOM for it.
	 * @param {Node} componentElement
	 */
	function _resolveComponent(componentElement) {
		// Find the controller for the component.
		const controller = window[componentElement.dataset[COMPONENT_DATASET]];

		if(typeof controller !== 'function') {
			console.error(`The controller for component "${componentElement.dataset[COMPONENT_DATASET]}" does not exist.`);
			return;
		}

		// Create a new virtual DOM for the component.
		const vdom = new Vdom(componentElement);



		// Patch the async stuff now (before initializing the controller, otherwise things won't get patched in time).
		// MAYBE?!?!?!?!?!?!?!?!?
		// patchWith(vdom);



		// TODO: Initialize controller here or after initial Render()?
		/**
		 * The component controller. Can inject the following dependencies.
		 * @param {Object} appState The global application state. See APPLICATION_STATE.
		 * @param {Node} host The host element of the component. This is the component that defines [data-iq-component].
		 * @param {Vdom} view The virtual DOM associated with the component. This is useful for manually re-rendering the view when the framework fails to detect changes.
		 */
		vdom._controller = new controller({
			appState: APPLICATION_STATE,
			host: componentElement,
			view: vdom,
		});




		// MAYBE setup watchers here?!???!?!?!
		const _bindings = {};
		_observe(vdom._controller, _bindings, () => {
			// Framework detected changes should cause the component to re-render.
			vdom.ComponentShouldChange(true);
		});




		// Call Render() for the consumer once using whatever's in the template already. There should be no need for them to manually call Render() again since data binding will take over.
		let renderWith = componentElement.innerHTML;

		// Allow arrow functions, less than, and greater than in the template...
		renderWith = renderWith.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

		// Reset the content so IQ can handle rendering.
		// componentElement.innerHTML = '';
		// WHAT IS THIS USE CASE AGAIN?!?!?!?!? Removed because child components lose their references when parent innerHTML is overwritten.

		vdom.Render(renderWith);

		// Add self to the global register so global state changes can re-render all components.
		GLOBAL_COMPONENT_REGISTER.add(vdom);

		// Mark the component as resolved.
		componentElement[COMPONENT_RESOLVED_SYMBOL] = true;
	}

	/**
	 * Load an IQ component (and any child components it may have).
	 * @param {Node} element The host element to load.
	 */
	function Load(element) {
		// Queue up child components to resolve.
		const components = Array
			.from(element.querySelectorAll(`[data-${COMPONENT}]`));

		// Queue the current target if it is an IQ component.
		if(element.dataset && element.dataset[COMPONENT_DATASET]) {
			components.unshift(element);
		}

		components
			// Only handle unresolved components.
			.filter(el => !el[COMPONENT_RESOLVED_SYMBOL])
			// Reverse the selector so child components can be done first. Lol. This is definitely not the best way to do this but whatevs.
			.reverse()
			.forEach(el => {
				_resolveComponent(el);
			});
	}

	return {
		Load
	};
})();

// function patchWith(vdom) {
// 	const oldSetTimeout = window.setTimeout;
// 	window.setTimeout = (fn, timeout) => oldSetTimeout(() => {
// 		fn();
// 		console.log(vdom);
// 		vdom.ComponentShouldChange(true);
// 	}, timeout);

// 	const oldSetInterval = window.setInterval;
// 	window.setInterval = (fn, interval) => oldSetInterval(() => {
// 		fn();
// 		console.log('on interval for', vdom);
// 		vdom.ComponentShouldChange(true);
// 	}, interval);
// }


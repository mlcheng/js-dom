/***********************************************

  "vdom.js"

  Created by Michael Cheng on 04/30/2018 20:18
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/

'use strict';

var iqwerty = iqwerty || {};

const CONTAINER_TAG = 'iq-container';
const COMPONENT = 'iq-component';
const COMPONENT_DATASET = 'iqComponent';
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
const BLACKLIST = Object.keys(window)
	.reduce((blacklist, prop) => Object.assign(blacklist, {
		[prop]: undefined
	}), {});

/**
 * A Promise that resolves when the DOM loads.
 */
const PAGE_LOADED = new Promise(resolve => {
	document.addEventListener('DOMContentLoaded', () => {
		resolve();
	});
});

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
function noop() {}

/**
 * A maybe-safer eval that does not allow global context.
 * @param {String} js Some JS to evaluate.
 * @param {Object} context
 * @return {any|undefined} Returns undefined if the JS couldn't be evaulated in context.
 */
function saferEval(js, context) {
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
function saferEvalTemplate(template, context) {
	return saferEval(`return \`${template}\``, context) || '';
}

/**
 * Observe an object and use the given bindings as storage. If an action is specified, it is called when the object has changes.
 * @param {Object} obj The object to observe.
 * @param {Object} bindings The object to store object values in.
 * @param {Function} action The callback when changes occur.
 */
function observe(obj, bindings, action = noop) {
	Object.keys(obj).forEach(prop => {
		if(typeof obj[prop] !== 'number' &&
			typeof obj[prop] !== 'string' &&
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
			observe(obj[prop], bindings, action);
		}
	});
}

iqwerty.vdom = (() => {
	/**
	 * Create a DOM node.
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

	/**
	 * A virtual text DOM node.
	 */
	function TextNode(text) {
		/**
		 * The text stored in the node.
		 * @type {String}
		 */
		this.text = text;
	}

	/**
	 * Parse a string with the DOMParser into DOM components in memory.
	 * @return {Node} Returns the HTML wrapped in a single component.
	 * @return {Node[]} Returns the array of children in the DocumentFragment.
	 */
	function _parseStringToHtml(html) {
		const content = new DOMParser().parseFromString(html, 'text/html').body;
		const componentRoot = document.createDocumentFragment();
		Array.from(content.childNodes).forEach(child => {
			componentRoot.appendChild(child);
		});

		return Array.from(componentRoot.childNodes);
	}

	/**
	 * Specifies whether or not the two nodes are different. A VirtualElement or TextNode may be inputs here.
	 * @param {VirtualElement|TextNode} newVdom
	 * @param {VirtualElement|TextNode} oldVdom
	 * @return {Boolean}
	 */
	function _elementChanged(newVdom, oldVdom) {
		if(newVdom instanceof VirtualElement && oldVdom instanceof VirtualElement) {
			return newVdom.tag !== oldVdom.tag;
		} else if(newVdom instanceof TextNode && oldVdom instanceof TextNode) {
			return newVdom.text !== oldVdom.text;
		}
		return true;
	}

	/**
	 * Patch the given root node with the new DOM.
	 */
	function _patch(root, newVdom, oldVdom, childIndex = 0) {
		// console.log(root, newVdom, oldVdom);

		if(!oldVdom) {
			// console.log('adding child');
			root.appendChild(_toElements(newVdom));
		} else if(!newVdom) {
			// console.log('removing child');
			root.removeChild(root.childNodes[childIndex]);
		} else if(_elementChanged(newVdom, oldVdom)) {
			// console.log('replacing child');
			root.replaceChild(_toElements(newVdom), root.childNodes[childIndex]);
		} else if(newVdom instanceof VirtualElement) {
			// console.log('diffing children');
			const newLength = newVdom.children.length;
			const oldLength = oldVdom.children.length;
			for(let i=0; i<newLength || i<oldLength; i++) {
				_patch(
					root.childNodes[childIndex],
					newVdom.children[i],
					oldVdom.children[i],
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
			return new TextNode(node.textContent);
		}

		const el = new VirtualElement(
			node.nodeName.toLowerCase(),
			undefined,
			...Array.from(node.childNodes).map(_toVirtualElements)
		);

		return el;
	}

	/**
	 * Create real HTML nodes from a VirtualElement.
	 * @param {VirtualElement}
	 * @return {Node}
	 */
	function _toElements(ve) {
		if(ve instanceof TextNode) {
			return document.createTextNode(ve.text);
		}

		const el = document.createElement(ve.tag);
		ve.children.map(_toElements).forEach(child => {
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
		return saferEvalTemplate(sb, context);
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
		_patch(newRootNode, newNode, oldNode);

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

	return {
		Vdom
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

PAGE_LOADED.then(() => {
	Array.from(document.querySelectorAll(`[data-${COMPONENT}]`))
		// Reverse the selector so child components can be done first. Lol. This is definitely not the best way to do this but whatevs.
		.reverse()
		.forEach(componentElement => {
			// Find the controller for the component.
			const controller = window[componentElement.dataset[COMPONENT_DATASET]];

			if(typeof controller !== 'function') {
				console.error(`The controller for component "${componentElement.dataset[COMPONENT_DATASET]}" does not exist.`);
				return;
			}

			// Create a new virtual DOM for the component.
			const vdom = new iqwerty.vdom.Vdom(componentElement);



			// Patch the async stuff now (before initializing the controller, otherwise things won't get patched in time).
			// MAYBE?!?!?!?!?!?!?!?!?
			// patchWith(vdom);



			// Initialize the component controller. Inject the virtual DOM so the consumer can render if needed.
			// TODO: Initialize controller here or after initial Render()?
			vdom._controller = new controller({ vdom });




			// MAYBE setup watchers here?!???!?!?!
			const _bindings = {};
			observe(vdom._controller, _bindings, () => {
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
	});
});
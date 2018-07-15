/***********************************************

  "vdom.js"

  Created by Michael Cheng and Jessie Jiang on 06/03/2018 16:23
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

	if(document.readyState === 'interactive' ||
		document.readyState === 'complete') {
			resolve();
	}
});

PAGE_LOADED.then(() => {
	iqwerty.vdom.Load(document.body);
});

iqwerty.vdom = (() => {
	const COMPONENT = 'iq-component';
	const COMPONENT_DATASET = 'iqComponent';
	const BINDING = '\{\{(.*?)\}\}';

	const IQ_EVENT = 'data-iq:';
	const IQ_DIRECTIVE = 'data-iq.';
	const IQ_IF_DIRECTIVE = `${IQ_DIRECTIVE}if`;
	// const IQ_FOR_DIRECTIVE = `${IQ_DIRECTIVE}for`;
	const IQ_EVENT_INJECTION = '$iqEvent';

	/**
	 * Define a blacklist of global properties that consumers shouldn't be able to use in their template. For example, `location` instead of `window.location`.
	 */
	const BLACKLIST = Object.getOwnPropertyNames(window)
		.reduce((blacklist, prop) => Object.assign(blacklist, {
			[prop]: undefined
		}), {});

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
	 * Used to specify that an IQ component Node has been resolved already and should not be touched anymore by external iqwerty.vdom.Load() calls.
	 * @type {Symbol}
	 */
	const COMPONENT_RESOLVED_SYMBOL = Symbol('componentResolved');

	/**
	 * Used as a property name on a Node to keep track of IQ listeners that are set on the Node.
	 * TODO: Figure out if this is a good thing to do.....
	 * @type {Symbol}
	 */
	const LISTENERS_SYMBOL = Symbol('listeners');

	/**
	 * Observe an object and use the given bindings as storage. If an action is specified, it is called when the object has changes.
	 * @param {Object} obj The object to observe.
	 * @param {Object} bindings The object to store object values in.
	 * @param {Function} action The callback when changes occur.
	 */
	function _observe(obj, bindings, action = () => {}) {
		Object.keys(obj).forEach(prop => {
			if(typeof obj[prop] !== 'number' &&
				typeof obj[prop] !== 'string' &&
				typeof obj[prop] !== 'boolean' &&
				typeof obj[prop] !== 'object' &&
				typeof obj[prop] !== 'undefined') {
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
					// Re-render the page when new values are set.
					action();
				}
			});

			// TODO: Determine if this is actually useful/performant.
			if(obj[prop] !== undefined)
			_patchObjectMutators(obj[prop], action);

			if(typeof obj[prop] === 'object') {
				// Recursively observe children if they're observable.
				_observe(obj[prop], bindings, action);
			}
		});
	}

	/**
	 * Allow calling mutating methods on objects to trigger re-render.
	 * TODO: Determine if this is actually useful/performant.
	 * @param {Object} obj The object whose methods we wish to patch.
	 * @param {Function} action The action to perform when a mutating method is called. Normally, this should be vdom.ComponentShouldChange(true).
	 */
	function _patchObjectMutators(obj, action) {
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
	 * A maybe-safer eval that does not allow global context.
	 * @param {String} js Some JS to evaluate.
	 * @param {Object} context
	 * @return {any|undefined} Returns undefined if the JS couldn't be evaulated in context.
	 */
	function _saferEval(js, context) {
		try {
			// TODO: Maybe don't do with()? An option is to use destructuring, but how to avoid window methods?
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
	 * Performs an action for each descendant node.
	 * @param {Node} node
	 * @param {Function} fn
	 */
	function _forAllChildrenOf(node, fn) {
		const iterator = [node];
		while(iterator.length) {
			const el = iterator.pop();
			fn(el);
			iterator.push(...el.childNodes);
		}
	}

	/**
	 * Determines whether an HTML node is an IQ component.
	 * @param {Node} node
	 * @return {Boolean}
	 */
	function _nodeIsComponent(node) {
		return node.nodeType === Node.ELEMENT_NODE &&
			node.dataset &&
			node.dataset[COMPONENT_DATASET];
	}

	/**
	 * Finds the IQ component of a given node.
	 * @param {Node} node
	 * @return {String}
	 */
	function _findComponentOfNode(node) {
		const iterator = [node];
		while(iterator.length) {
			const possibleComponent = iterator.pop();

			if(_nodeIsComponent(possibleComponent)) {
				return possibleComponent.dataset[COMPONENT_DATASET];
			}

			if(possibleComponent.parentElement) {
				iterator.push(possibleComponent.parentElement);
			} else {
				console.error('Node has no component.', possibleComponent);
			}
		}
	}

	/**
	 * Recursively remove empty text nodes from a node.
	 * @param {Node} root
	 * @return {Node} Return the node with no more empty text nodes.
	 */
	function _removeEmptyNodes(root) {
		_forAllChildrenOf(root, (child) => {
			if(child.nodeType === Node.TEXT_NODE && /^\s+$/.test(child.textContent)) {
				child.parentNode.removeChild(child);
			}
		});

		return root;
	}

	/**
	 * Evaulate bindings in template strings with the given context.
	 * @param {Node} node
	 * @param {Object} context
	 * @return {Node}
	 */
	function _evaluateBindings(node, context) {
		const iterator = [node];
		while(iterator.length) {
			const el = iterator.pop();
			// If a component is encountered but it isn't the root node, then it's a child IQ component. Skip these and leave them for future cycles.
			if(_nodeIsComponent(el) && el !== node) {
				continue;
			}

			if(el.nodeType === Node.TEXT_NODE) {
				const fragment = document.createDocumentFragment();

				// ¯\_(ツ)_/¯
				const tempContainer = document.createElement('x-temp');

				tempContainer.innerHTML = _saferEvalTemplate(el.textContent, context);

				// This needs to be a copy of childNodes otherwise it loses children after the first append. No idea why. This took forever to debug, so... don't change this!
				for(const child of Array.from(tempContainer.childNodes)) {
					fragment.appendChild(child);
				}

				// Replace the original text node with the new (possibly element) node(s).
				el.parentNode.replaceChild(fragment, el);
			} else if(el.nodeType === Node.ELEMENT_NODE) {
				// Evaluate attributes too.
				for(const {name, value} of el.attributes) {
					el.setAttribute(name, _saferEvalTemplate(value, context));
				}
			}

			iterator.push(...el.childNodes);
		}

		return node;
	}

	/**
	 * Given text, transforms the binding syntax to a template string.
	 * @param {String} text
	 * @return {String}
	 */
	function _templatizeBindings(text) {
		const regex = new RegExp(BINDING, 'g');
		return text.replace(regex, '${$1}');
	}

	/**
	 * Parse binding syntax i.e. {{text}} within the template and change it to ${text}. Templatizes all text within the node because there's no need to let children templatize themselves.
	 * @param {Node} node
	 * @param {Object} context The component's controller.
	 * @return {Node}
	 */
	function _parseBindings(node) {
		const clone = node.cloneNode(true);

		_forAllChildrenOf(clone, (el) => {
			if(el.nodeType === Node.TEXT_NODE) {
				el.textContent = _templatizeBindings(el.textContent);
			} else if(el.nodeType === Node.ELEMENT_NODE) {
				// Parse attributes bindings too.
				for(const {name, value} of el.attributes) {
					el.setAttribute(name, _templatizeBindings(value));
				}
			}
		});

		return _removeEmptyNodes(clone);
	}

	/**
	 * If text node, compares inner text content. Otherwise, compares the tag name to determine if a node has changed.
	 * @param {Node} newDom
	 * @param {Node} oldDom
	 * @return {Boolean}
	 */
	function _nodeChanged(newDom, oldDom) {
		//
		//
		//
		//
		// TODO: OMGGGGGGG!!!!!!!!!!!!!!
		//
		//
		//
		//
		// if(newDom.nodeType === Node.TEXT_NODE && oldDom.nodeType === Node.TEXT_NODE) {
		// 	return newDom.textContent !== oldDom.textContent;
		// }

		// return newDom.tagName !== oldDom.tagName;
		return newDom.textContent !== oldDom.textContent;
	}

	/**
	 * Diffs virtual nodes and actual nodes and patches differences into the DOM.
	 * @param {Node} node
	 * @param {Node} newDom
	 * @param {Node} oldDom
	 * @param {Number} index
	 */
	function _patchHelper(node, newDom, oldDom, index = 0) {
		if(!oldDom) {
			node.appendChild(newDom);
		} else if(!newDom) {
			node.removeChild(node.childNodes[index]);
		} else if(_nodeChanged(newDom, oldDom)) {
			// Clone the newDom because if it's used to replace something, it is removed from itself (resulting in wrong indexing later).
			node.replaceChild(newDom.cloneNode(true), node.childNodes[index]);
		} else if(newDom.nodeType === Node.ELEMENT_NODE) {
			const newLength = newDom.childNodes.length;
			const oldLength = oldDom.childNodes.length;
			for(let i=0; i<newLength || i<oldLength; i++) {
				_patchHelper(
					node.childNodes[index],
					newDom.childNodes[i],
					oldDom.childNodes[i],
					i
				);
			}

			// Attributes...
			for(const {name, value} of newDom.attributes) {
				node.childNodes[index].setAttribute(name, value);
			}
		}
	}

	/**
	 * Loops through child nodes and patches differences.
	 * @param {Node} node The actual DOM node to patch.
	 * @param {Node} newDom The vdom after evaluating bindings.
	 * @param {Node} oldDom The previous vdom.
	 * @param {Number} index The index of the child node that is currently being used.
	 */
	function _patch(context, node, newDom, oldDom) {
		// Patch everything in (including child IQ components), but only handle events for non-child IQ components.
		for(let i=0; i<newDom.childNodes.length || i<oldDom.childNodes.length; i++) {
			_patchHelper(node, newDom.childNodes[i], oldDom.childNodes[i], i);

			// Attributes...
			for(const {name, value} of newDom.attributes) {
				node.setAttribute(name, value);
			}
		}
	}

	/**
	 * Attach an IQ event to the given node.
	 * @param {Node} node
	 * @param {String} name The attribute name.
	 * @param {String} value The attribute value.
	 * @param {Object} context
	 */
	function _attachEvent(node, name, value, context) {
		if(name.indexOf(IQ_EVENT) !== 0) {
			return;
		}

		const event = name.split(IQ_EVENT)[1];

		if(node[LISTENERS_SYMBOL] === undefined) {
			node[LISTENERS_SYMBOL] = new Map();
		} else if(node[LISTENERS_SYMBOL].has(event)) {
			// Update the event in case something weird happens like the node takes the event of a previous node that was removed or something.
			node[LISTENERS_SYMBOL].set(event, value);
		}

		const fn = (e) => {
			if(e.currentTarget !== node) {
				return;
			}

			context[IQ_EVENT_INJECTION] = e;

			const returnValue = _saferEval(
				node[LISTENERS_SYMBOL].get(event),
				context
			);

			delete context[IQ_EVENT_INJECTION];
			return returnValue;
		};

		if(!node[LISTENERS_SYMBOL].has(event)) {
			node[LISTENERS_SYMBOL].set(event, value);
			node.addEventListener(event, fn, true);
		}
	}

	/**
	 * Evaulate the `if` directive to determine whether or not to render the given node.
	 * @param {Node} node
	 * @param {String} name The attribute name.
	 * @param {String} value The attribute value.
	 * @param {Object} context
	 */
	function _attachIf(node, name, value, context) {
		if(name.indexOf(IQ_IF_DIRECTIVE) !== 0) {
			return;
		}

		const interpolation = `return !!${value};`;

		const result = _saferEval(interpolation, context);

		if(!result) {
			// I can't believe this worked.
			node.parentElement.removeChild(node);
		}
	}

	// function _attachFor(node, name, value, context) {
	// 	if(name.indexOf(IQ_FOR_DIRECTIVE) !== 0) {
	// 		return;
	// 	}

	// 	const parts = value.split(' in ');
	// 	const iterator = parts[0];
	// 	const iterable = parts[1];

	// 	if(!iterator || !iterable) {
	// 		throw new Error(`Error in iterator value "${value}". To loop through an iterable, use \`<el data-iq.for="item in this.items">\``);
	// 	}

	// 	const repeatedNode = node.innerHTML;
	// 	node.innerHTML = '';
	// 	console.log(repeatedNode, context);

	// 	const expr = `return ${iterable}
	// 		.map(${iterator} => '${repeatedNode.replace(/\n/g, "")}')
	// 		.join('')`;

	// 	node.innerHTML += _saferEval(expr, context);
	// 	console.log(node.innerHTML);
	// }

	/**
	 * Attach IQ events and evaulate directives for the given node.
	 * @param {Node} node
	 * @param {Object} context
	 */
	function _attachEventsAndDirectives(node, context) {
		_forAllChildrenOf(node, el => {
			if(el.nodeType === Node.ELEMENT_NODE &&
				_findComponentOfNode(el) === context.constructor.name) {
					for(const {name, value} of el.attributes) {
						_attachEvent(el, name, value, context);
						_attachIf(el, name, value, context);
						// _attachFor(el, name, value, context);
					}
			}
		});
	}

	/**
	 * Parse the bindings of a component while skipping child IQ components embedded inside. Patches the real DOM with the differences after evaluation.
	 * This is called whenever change is detected within a component. Because rendering may trigger child IQ components to be created, Load is called at the end to dynamically resolve children.
	 */
	function Render() {
		const evaluatedDom =
			// Parse bindings again in case children come out with bindings.
			_parseBindings(
				_evaluateBindings(
					this._templatizedTemplate.cloneNode(true),
					this._controller
				)
			);

		const previousVdom = this._componentRoot;
		const newestVdom = evaluatedDom;

		// TODO: Let's patch after all HTML is final, e.g. all components are resolved and their HTML is evaluated. Then we only need to patch once on each change cycle.
		_patch(this._controller, this._componentRoot, newestVdom, previousVdom);

		_attachEventsAndDirectives(this._componentRoot, this._controller);

		// Just unresolve the child components (not all components) and it doesn't do an infinite loop.
		this._componentRoot.querySelectorAll(`[data-${COMPONENT}]`).forEach(component => {
			component[COMPONENT_RESOLVED_SYMBOL] = false;
		});

		Load(this._componentRoot);
	}

	/**
	 * Called as a result of change being detected in a component. This calls Render on the component's vdom.
	 * @param {Boolean} _changeDetectedByFramework By default, callers specify that they manually triggered change detection to re-render components. In these cases, the framework cannot observe changes to those objects on the controller. Some MUTATORS are supported, but nested things are trickier. If calling this is necessary in the consumer's code, a warning is logged to the console.
	 */
	function ComponentShouldChange(_changeDetectedByFramework = false) {
		if(!_changeDetectedByFramework) {
			console.warn('Automatic change detection is triggered by reassigning a value - such as concatenating instead of pushing to an array. Some mutating methods are supported in this framework (see MUTATORS). Use of view.ComponentShouldChange() is allowed, but discouraged.');
		}

		this.Render();
	}

	function Vdom(componentRoot) {
		/**
		 * The controller for the component.
		 * @type {Function}
		 */
		this._controller;

		/**
		 * The HTML element of the component root.
		 * @type {Node}
		 */
		Object.defineProperty(this, '_componentRoot', {
			value: _removeEmptyNodes(componentRoot),
			writable: false,
		});

		/**
		 * The template after converting bindings into the template string syntax. This is cached so future Renders are less expensive (since they happen on each change detection cycle).
		 * @type {String}
		 */
		Object.defineProperty(this, '_templatizedTemplate', {
			value: _parseBindings(componentRoot),
			writable: false,
		});
	}

	Vdom.prototype = {
		ComponentShouldChange,
		Render,
	};

	/**
	 * Instantiates the component controller and initializes change detection on the controller.
	 * @param {Node} componentElement
	 */
	function _resolveComponentIfNeeded(componentElement) {
		if(componentElement[COMPONENT_RESOLVED_SYMBOL]) {
			return;
		}

		// The component must be resolved before calling Render, because Render may trigger additional Load calls, which will result in the component never being resolved. Lmao.
		componentElement[COMPONENT_RESOLVED_SYMBOL] = true;

		// Find the controller for the component.
		const controller = window[componentElement.dataset[COMPONENT_DATASET]];

		if(typeof controller !== 'function') {
			console.error(`The controller for component "${componentElement.dataset[COMPONENT_DATASET]}" does not exist.`);
			return;
		}

		// Create a new virtual DOM for the component.
		const vdom = new Vdom(componentElement);

		// Inject IQ custom event handler and dispatcher for consumers to easily emit events. Custom events are emitted and handled synchronously.
		// https://stackoverflow.com/questions/15277800
		const iqEventHandler = {
			dispatch: (event, detail) => {
				const _event = new CustomEvent(event, {detail});
				componentElement.dispatchEvent(_event);
			},

			handle: (handler) => (iqEvent, ...args) => {
				if(iqEvent === undefined) {
					return console.error(`Event not found.

1. Did you inject $iqEvent in your template?
2. $iqEvent must be the first argument in your handler.

e.g.
<el data:iq-click="this.clickHandler($iqEvent, this.otherParam)" />`);
				}

				return handler(iqEvent.detail, ...args);
			},
		};

		// Instantiate the component controller and inject deps.
		vdom._controller = new controller({
			host: componentElement,
			view: vdom,
			event: iqEventHandler,
		});

		_observe(vdom._controller, {}, () => {
			vdom.ComponentShouldChange(true);
		});

		vdom.Render();
	}

	/**
	 * Traverses the DOM and looks for IQ components to resolve. This is an exported function used to dynamically render IQ components as they are inserted in the DOM.
	 * Note that NodeIterator or TreeWalker are not used because of performance issues. See https://stackoverflow.com/questions/7941288/when-to-use-nodeiterator.
	 * @param {Node} element
	 */
	function Load(element) {
		const components = Array.from(element.querySelectorAll(`[data-${COMPONENT}]`));

		if(_nodeIsComponent(element)) {
			components.unshift(element);
		}

		components.forEach(component => {
			_resolveComponentIfNeeded(component);
		});
	}

	return {
		Load,
	};
})();
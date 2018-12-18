/***********************************************

  "dom.js"

  Created by Michael Cheng and Jessie on 06/03/2018 16:23
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/

'use strict';

var iqwerty = iqwerty || {};

/* exported Component */

/**
 * The case Component class.
 */
class Component {
	constructor() {
		this.$iq = {
			/** @type {String} The template for the component. */
			template: '',
		};

		// Blacklist global methods so they can't be accessed on the template accidentally. Only overwrite them if they aren't already on the class.
		const BLACKLIST = Array.from(Object.getOwnPropertyNames(window));
		const CLASS_PROPS = Object.getOwnPropertyNames(
			Object.getPrototypeOf(this)
		);
		BLACKLIST.forEach(prop => {
			if(CLASS_PROPS.indexOf(prop) !== -1) return;
			Object.defineProperty(this, prop, {
				value: undefined,
				configurable: true,
				writable: true
			});
		});
	}

	$iqOnMount() {}
}

const DOM_PAGE_LOADED = new Promise(resolve => {
	document.addEventListener('DOMContentLoaded', () => {
		resolve();
	});

	if(document.readyState === 'interactive' ||
		document.readyState === 'complete') {
			resolve();
	}
});

DOM_PAGE_LOADED.then(() => {
	iqwerty.dom.Load(document.body);
});

iqwerty.dom = (() => {
	/** @type {String} The regex for finding data bindings. */
	const BINDING = '\{\{(.*?)\}\}';

	/** @type {Symbol} The key that holds IQ data within an element. */
	const IQ_SYM = Symbol('$iq');
	/** @type {Symbol} The key that holds the component controller within the element. */
	const IQ_SYM_CTRL = Symbol('controller');
	/** @type {Symbol} The key that holds inputs to the component. */
	const IQ_SYM_INPUTS = Symbol('inputs');

	/** @type {String} The key that holds IQ metadata within a class. */
	const IQ = '$iq';
	/** @type {String} The key that holds the component template within the class metadata. */
	const IQ_MD_TPL = 'template';

	const IQ_CONTAINER = 'iq-container';
	const IQ_DIRECTIVE = 'iq.';
	const IQ_DIRECTIVES = new Set(['for', 'if']);
	const IQ_EVENT = 'iq:';
	const IQ_EVENT_INJECT = '$iqEvent';

	/**
	 * Define a mapping of classes to its mutating methods. This is used for change detection. The framework proxies mutating methods and allows the UI to re-render when a mutating method is used.
	 * This is done because the main solution for change detection here is proxying getters and setters on an object.
	 * @type {Object}
	 */
	const MUTATORS = Object.freeze({
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
	});

	/**
	 * Turns a snake-case string into PascalCase.
	 * @param {String} str
	 * @return {String}
	 */
	function _toPascalCase(str) {
		return str
			// To camelCase.
			.replace(/-([a-z])/g, g => g[1].toUpperCase())
			// To PascalCase.
			.replace(/^[a-z]/, c => c.toUpperCase());
	}

	function _getTemplateLoader() {
		return url => ({
			for(classContext) {
				return fetch(url)
					.then(response => response.text())
					.then(template => {
						classContext[IQ][IQ_MD_TPL] = template;
					});
			}
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
			// Context is sanitized by the base Component.
			.call(context);
		} catch(e) {
			// Some variable couldn't be found in the executed JS (or something like that).
			console.error(e, `JavaScript couldn't be executed in the given context.\nJavaScript:\n${js}\nComponent context:`, context);

			return undefined;
		}
	}

	/**
	 * Return a value with a given context.
	 * @param {String} js The value to return.
	 * @param {Object} context
	 * @return {?} Returns the value in the given context.
	 */
	function _saferEvalReturn(js, context) {
		return _saferEval(`return ${js}`, context);
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
	 * Maybe instantiate the class and return it if its valid.
	 * @param {String} maybeClassName The name of the class to instantiate.
	 * @param {Node} componentElement The component element.
	 * @param {Object} detector The change detector.
	 * @return {Object} Returns the class if it was instantiated.
	 * @throws Throws an error if there were any issues when instatiating, e.g. naming errors, unsafe values.
	 */
	function _saferInstantiateComponent(maybeClassName, componentElement, detector) {
		// jshint unused:false

		// Do some static checks to make sure the class name is maybe safe.
		if(!(/[A-Z]/.test(maybeClassName))) {
			throw new Error(`The class "${maybeClassName}" doesn't seem like a valid class name. Quantum components are recommended to be in PascalCase`);
		}

		const loader = _getTemplateLoader();

		/** @type {Object} Things to inject into the component if needed. */
		const inject = `{
			detector: detector,
			elementRef: componentElement,
			loadTemplate: loader,
		}`;

		/** @type {Object} This is the controller if everything went ok. */
		let maybeCtrl;

		try {
			// jshint evil:true
			maybeCtrl = eval(`new ${maybeClassName}(${inject})`);
		} catch(e) {
			console.warn(`Did you remember to create the class "${maybeClassName}"?`);
			// TODO: Hey why even try then if you're just going to rethrow it?
			throw new Error(e);
		}

		// This definitely exists as a result of extending Component.
		if(!maybeCtrl[IQ]) {
			throw new Error(`Whoops. Your component name "${maybeClassName}" probably conflicts with some JS reserved word.`);
		}

		return maybeCtrl;
	}

	/**
	 * Observe an object and use the object itself as data storage. If an action is specified, it is called when the object has changes.
	 * @param {Object} obj The object to observe.
	 * @param {Function} action The callback when changes occur.
	 */
	function _observe(obj, action = () => {}) {
		// We store the bindings on the object itself, inside the `$iq` prop. This is probably safe since its key is a symbol, and completely inaccessible from the outside unless someone decided to getAllPropertySymbols.
		if(!obj[IQ_SYM]) {
			obj[IQ_SYM] = {};
		}

		Object.keys(obj).forEach(prop => {
			// We don't want to do anything with functions or things we can't clone/watch properly.
			if(typeof obj[prop] !== 'number' &&
				typeof obj[prop] !== 'string' &&
				typeof obj[prop] !== 'boolean' &&
				typeof obj[prop] !== 'object' &&
				typeof obj[prop] !== 'undefined') {
					return;
			}

			// Don't want to re-observe things that are already observed. Maybe this doesn't work. Oh well?
			if(obj[IQ_SYM][prop] === obj[prop]) {
				return;
			}

			// Set the original value first.
			obj[IQ_SYM][prop] = obj[prop];

			Object.defineProperty(obj, prop, {
				get() {
					return obj[IQ_SYM][prop];
				},

				set(value) {
					obj[IQ_SYM][prop] = value;

					// Re-render the component when changes occur.
					action();
				}
			});

			// Patch the mutating methods so that changes are detected semi-automatically.
			// TODO: Determine if this is actually useful/performant.
			if(obj[prop] != null) {
				_patchObjectMutators(obj[prop], action);
			}

			// Recursively observe children if they're observable.
			if(typeof obj[prop] === 'object') {
				_observe(obj[prop], action);
			}
		});
	}

	/**
	 * Allow calling mutating methods on objects to trigger re-render.
	 * TODO: Determine if this is actually useful/performant.
	 * @param {Object} obj The object whose methods we wish to patch.
	 * @param {Function} action The action to perform when a mutating method is called.
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

				// This is IMPORTANT! If not set, then any new objects that are on the obj will not be observed. For example, pushing a new object to an array will cause that object to not be observed, breaking the change detection.
				_observe(obj, action);
				return ret;
			};
		});
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

	function _handleFor(vnode, context) {
		console.log('for', vnode, context);
		const expression = vnode.dataset[`${IQ_DIRECTIVE}for`];
		const variable = expression.substring(0, expression.indexOf(' '));

		const vnodes = _saferEval(`
			const out = [];
			for(const ${expression}) {
				out.push({
					html: \`${vnode.outerHTML}\`,
					context: ${variable},
				});
			}
			return out;
		`, context);

		const fragment = document.createDocumentFragment();
		vnodes.forEach(node => {
			const n = document.createElement(IQ_CONTAINER);
			n.innerHTML = node.html;
			// Definitely has the one child, which is the element that got for'd.
			const generatedNode = n.children[0];


			// This lets the children have the runtime for context as well. Maybe this is stupid. But idk man. It works.
			const iterator = [generatedNode];
			while(iterator.length) {
				const n = iterator.pop();
				n[IQ_SYM] = new Map();
				n[IQ_SYM].set(IQ_SYM_INPUTS, new Map());
				n[IQ_SYM].get(IQ_SYM_INPUTS).set(variable, node.context);
				iterator.push(...n.children);
			}
			// generatedNode[IQ_SYM] = new Map();
			// generatedNode[IQ_SYM].set(IQ_SYM_INPUTS, new Map());
			// generatedNode[IQ_SYM].get(IQ_SYM_INPUTS).set(variable, node.context);



			// OMG remember this otherwise generated components won't have any events. MAYBE attributes are needed as well?! IDKKKKKK.
			// _prepareEvents(generatedNode, context);


			// Maybe?!?!
			// Remove the iq.for from the node, otherwise evaluating again will cause infinite loop lol.
			generatedNode.removeAttribute(`data-${IQ_DIRECTIVE}for`);

			// Add the local iq.for context temporarily before evaulating the generated code.
			context[variable] = node.context;
			_evaluateTemplate(generatedNode, context);
			delete context[variable];



			fragment.appendChild(n.children[0]);
		});

		// TODO: Why are these needed... If these things aren't removed, then the following template evaluation will still include the original for'd element's stuff and the local scope variable will be undefined (and then throw errors).
		vnode.innerHTML = '';
		for(const {name} of vnode.attributes) {
			vnode.removeAttribute(name);
		}

		// Replace the original for'd element with the new ones.
		vnode.parentNode.replaceChild(fragment, vnode);
	}

	function _handleIf(vnode, context) {
		console.log('if', vnode);
		const expression = vnode.dataset[`${IQ_DIRECTIVE}if`];
		const show = _saferEvalReturn(expression, context);

		// If the hidden node is at the top, e.g.
		// <span data-iq.if="">foo</span>
		// <p>other thing</p>
		// Then the diff will always replaceChild the <span> with the <p>, and therefore the <p> will be needlessly overwritten. This is not a good diff. Replace it with a comment instead of removing the child.
		if(!show) {
			const comment = document.createComment('iq.if removed node');
			vnode.parentNode.replaceChild(comment, vnode);
		}
	}

	function _prepareDirectives(vnode, context) {
		Object.keys(vnode.dataset)
			.filter(key => key.indexOf(IQ_DIRECTIVE) === 0)
			.forEach(d => {
				const directive = d.replace(IQ_DIRECTIVE, '');

				// If not in the known directives set, then these are inputs to the child component.
				if(!IQ_DIRECTIVES.has(directive)) {
					if(!vnode[IQ_SYM]) {
						vnode[IQ_SYM] = new Map();
						vnode[IQ_SYM].set(IQ_SYM_INPUTS, new Map());
					}

					// Set the inputs onto the $iq metadata object.
					// $iq: {
					//   'inputs': {
					//   	'items': ['item 1', 'item 2']
					//   }
					// }
					vnode[IQ_SYM].get(IQ_SYM_INPUTS).set(
						directive,
						_saferEvalReturn(vnode.dataset[d], context)
					);
				}

				// Handle known directives.
				switch(directive) {
					case 'for':
						_handleFor(vnode, context);
						break;
					case 'if':
						_handleIf(vnode, context);
						break;
					default:
						break;
				}
			});
	}

	function _prepareEvents(vnode, context) {
		console.log('events', vnode);
		Object.keys(vnode.dataset)
			.filter(key => key.indexOf(IQ_EVENT) === 0)
			.forEach(e => {
				const eventType = e.replace(IQ_EVENT, '');
				console.log('event', eventType);
				vnode.addEventListener(eventType, event => {
					console.log('event happened!', vnode.dataset[e]);




					/******************************************/
					// TODO: Cleanup.
					// Add the metadata to the context. This could have e.g. been generated by a iq.for.
					if(vnode[IQ_SYM] && vnode[IQ_SYM].get(IQ_SYM_INPUTS)) {
						vnode[IQ_SYM].get(IQ_SYM_INPUTS).forEach((value, key) => {
							console.log('restoring data from metadata', key, value);
							context[key] = value;
						});
					}
					// Also add the actual event to the context.
					context[IQ_EVENT_INJECT] = event;

					_saferEval(vnode.dataset[e], context);

					// TODO: Cleanup.
					if(vnode[IQ_SYM] && vnode[IQ_SYM].get(IQ_SYM_INPUTS)) {
						vnode[IQ_SYM].get(IQ_SYM_INPUTS).forEach((value, key) => {
							delete context[key];
						});
					}
					delete context[IQ_EVENT_INJECT];
					/******************************************/




				});
			});
	}

	/**
	 * Evaluate the template. Text nodes, directives, events, and attributes are handled here.
	 * @param {Node} vnode A virtual node.
	 * @param {Object} context The component controller.
	 */
	function _evaluateTemplate(vnode, context) {
		const iterator = [vnode];
		while(iterator.length) {
			const node = iterator.pop();

			if(node.nodeType === Node.TEXT_NODE) {
				node.textContent = _saferEvalTemplate(node.textContent, context);
			} else if(node.nodeType === Node.ELEMENT_NODE) {
				_prepareDirectives(node, context);
				_prepareEvents(node, context);

				for(const {name, value} of node.attributes) {
					if(name.indexOf(IQ_DIRECTIVE) !== -1) continue;
					const newValue = _saferEvalTemplate(value, context);
					if(node.getAttribute(name) === newValue) continue;

					console.log('changing attributes', node, name);
					node.setAttribute(name, newValue);
				}
			}

			iterator.push(...node.childNodes);
		}
	}

	/**
	 * The node is defined as changed if it's a different node type, text content has changed (if it's a text node), or it's a completely different tag.
	 * Some guidance: the node list from the [existing] and [new] might look something:
	 *
	 * [text, ul, text] vs [text, ul]
	 * @param {Node} prev
	 * @param {Node} cur
	 * @return {Boolean} Whether or not the node changed.
	 */
	function _nodeChanged(prev, cur) {
		return prev.nodeType !== cur.nodeType ||
		prev.nodeType === Node.TEXT_NODE && prev.textContent !== cur.textContent ||
		prev.tagName !== cur.tagName;
	}

	/**
	 * Patch a node (fragment) into an existing node (fragment).
	 * @param {Node|DocumentFragment} final
	 * @param {Node|DocumentFragment} from
	 */
	function _patch(final, from) {
		const finalList = Array.from(final.childNodes), newList = Array.from(from.childNodes);
		console.log(finalList, newList);

		let i = 0;
		while(finalList[i] || newList[i]) {
			if(!finalList[i]) {
				console.log('appending');
				final.appendChild(newList[i]);
			} else if(!newList[i]) {
				console.log('removing');
				// TODO: Not tested yet?
				final.removeChild(finalList[i]); // or final.childNodes[i]?
			} else if(_nodeChanged(finalList[i], newList[i])) {
				console.log('changing!', finalList[i], newList[i]);
				finalList[i].parentNode.replaceChild(newList[i], finalList[i]);
			} else if(newList[i].nodeType === Node.ELEMENT_NODE) {
				console.log('checking children');
				_patch(finalList[i], newList[i]);

				for(const {name, value} of newList[i].attributes) {
					// Michael, don't `return` here. Otherwise you'll skip all the rest of the patches... lol.
					if(name.indexOf(IQ_DIRECTIVE) !== -1) continue;
					if(finalList[i].getAttribute(name) === value) continue;

					console.log('updating attributes', finalList[i], name);
					finalList[i].setAttribute(name, value);
				}

				// Hmmm.... maybe it's not needed. Lol idk?!
				// LOL THIS IS NEEDED. OTHERWISE WHEN GETTING STUFF FROM METADATA (E.G. DURING EVENTS), IT'LL GET THE METADATA FROM ELEMENTS THAT WERE PREVIOUSLY HERE (WHICH IS WRONG)!!!!!!!
				finalList[i][IQ_SYM] = newList[i][IQ_SYM];
			}
			i++;
		}
	}

	/**
	 * TODO: Write a description.
	 * @param {Node} root The root node to load components on.
	 * @param {DocumentFragment} stub The stub node to perform all patches on before actually patching to the DOM. DOM operations are expensive, so we're minimizing any manipulation here.
	 * @param {Boolean} shouldPatch Only the root Load should patch the actual DOM. Loading children and patching onto the stub should not touch the real DOM until all Load operations are complete.
	 */
	function Load(root, stub = document.createDocumentFragment(), shouldPatch = true) {
		const allElements = Array.from(root.querySelectorAll('*')).concat(root);
		const iqComp = allElements.filter(el => el.tagName.indexOf('-') !== -1);

		iqComp.forEach(compEl => {
			// Instantiate metadata containers (e.g. controller, inputs).
			if(!compEl[IQ_SYM]) {
				compEl[IQ_SYM] = new Map();
				compEl[IQ_SYM].set(IQ_SYM_INPUTS, new Map());
			}

			let ctrl;
			if(compEl[IQ_SYM].get(IQ_SYM_CTRL)) {
				// Get the controller that's stored inside the metadata.
				ctrl = compEl[IQ_SYM].get(IQ_SYM_CTRL);
			} else {
				/**
				 * The change detector to optionally inject into component classes.
				 * @type {Object}
				 */
				const detector = {
					ComponentShouldChange() {
						Load(compEl);
					}
				};

				const className = _toPascalCase(compEl.tagName.toLowerCase());
				ctrl = _saferInstantiateComponent(className, compEl, detector);

				// Set inputs from the parent onto the controller if there are any.
				compEl[IQ_SYM].get(IQ_SYM_INPUTS).forEach((value, key) => {
					ctrl[key] = value;
				});

				// Set the controller onto the component metadata.
				compEl[IQ_SYM].set(IQ_SYM_CTRL, ctrl);

				// Initialize observing class props because this is when the class is instantiated. Don't want to do it any other time otherwise there'll be too many change detectors.
				_observe(ctrl, () => {
					detector.ComponentShouldChange();
					console.log('observed changes happening');
				});
			}

			// Get the template from the component metadata.
			const tpl = _templatizeBindings(ctrl[IQ][IQ_MD_TPL]);

			// Garbage code is starting...
			// Get the element onto a DocumentFragment, so it's a "virtual" node.
			const _node = document.createElement(IQ_CONTAINER);
			_node.innerHTML = tpl;
			const v = document.createDocumentFragment();
			// Get the node children into the fragment. We don't want the <iqcontainer /> to actually be in the DOM later.
			// Using NodeList directly (without using array) removes the nodes each iteration. No idea why.
			Array.from(_node.childNodes).forEach(child => {
				v.appendChild(child);
			});

			// Virtual actions should be here. Nothing going forward should touch the actual DOM until child operations are complete.
			_evaluateTemplate(v, ctrl);

			// Fake-patch to a fragment and then do the actual patch after all Load operations are done.
			_patch(stub, v);

			// Then do the same for its children.
			if(stub.children.length) {
				// We only want child elements (since a non-element node is definitely not a component), so we use children instead of childNodes.
				Array.from(stub.children).forEach(childElement => {
					// IDK if this makes sense ¯\_(ツ)_/¯
					Load(childElement, childElement, false);
				});
			}

			// Patch the actual DOM. This expensive operation should only happen for the root-most component.
			if(shouldPatch) {
				_patch(compEl, stub);
			}
		});
	}

	return {
		Load
	};
})();
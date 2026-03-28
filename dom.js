/***********************************************

  "dom.js"

  Created by Michael Cheng on 2/21/2020 9:16:26 PM
			http://michaelcheng.us/
			michael@michaelcheng.us
			--All Rights Reserved--

***********************************************/

'use strict';

import { recursivelyGetChildren, saferEval } from './util';

export const dom = (() => {
	const COMPONENTS = new Map();
	const IQ = '$iq';
	const IQ_NODE = '$iqn';
	const BINDING = '\\{\\{(.*?)\\}\\}';
	const DS_IQ_INPUT = 'iq.';
	const DS_IQ_EVENT = 'iq:';

	class Component {
		constructor() {
			if (typeof window === 'undefined') return;

			const BLACKLIST = Object.getOwnPropertyNames(window);
			const CLASS_PROPS = Object.getOwnPropertyNames(Object.getPrototypeOf(this));

			for (const prop of BLACKLIST) {
				if (CLASS_PROPS.indexOf(prop) !== -1) continue;

				try {
					Object.defineProperty(this, prop, {
						enumerable: false,
						value: undefined,
						configurable: true,
						writable: true
					});
				} catch(e) {
					// Ignore strictly read-only window properties
				}
			}
		}
	}

	function getMergedContexts(el) {
		const nodeStore = getNodeStore(el);
		const baseContext = (nodeStore.baseStore && nodeStore.baseStore.baseContext) ? nodeStore.baseStore.baseContext : {};
		const mergedContexts = Object.create(baseContext);
		return Object.assign(mergedContexts, nodeStore.runtimeContext || {});
	}

	function saferEvalText(text, el) {
		return saferEval(`return \`${text}\``, getMergedContexts(el));
	}

	function saferEvalValue(value, el) {
		return saferEval(`return ${value}`, getMergedContexts(el));
	}

	function evaluateForInput(element, iterator) {
		const [item, value] = iterator.split(' of ').map(s => s.trim());

		if (!item || !value) {
			console.error(`Error in \`data-iq.for\` syntax. Please use \`x of y\`. You used \`${iterator}\``);
			return;
		}

		const evaluatedList = saferEvalValue(value, element) || [];
		const baseStore = getNodeStore(element).baseStore;
		const fragment = document.createDocumentFragment();

		element.removeAttribute('data-iq.for');
		delete element.dataset['iq.for'];

		evaluatedList.forEach((val) => {
			const clone = element.cloneNode(true);
			generateNodeStore(clone);
			getNodeStore(clone).baseStore = baseStore;

			getNodeStore(clone).runtimeContext = Object.assign(
				{},
				getNodeStore(element).runtimeContext,
				{ [item]: val }
			);

			fragment.appendChild(clone);
		});

		element.parentNode.insertBefore(fragment, element);
		element.remove();
	}

	function generateIqStore(el) {
		el[IQ] = {
			baseContext: {},
			elementRef: el,
			initialized: true,
			template: undefined,
			templatizedTemplate: undefined,
		};
	}

	function getIqStore(el) {
		return (el && el[IQ]) ? el[IQ] : {};
	}

	function cloneIqStoreTo(from, to) {
		to[IQ] = from[IQ];
	}

	function generateNodeStore(el) {
		el[IQ_NODE] = {
			baseStore: undefined,
			runtimeContext: undefined,
		};
	}

	function getNodeStore(el) {
		return (el && el[IQ_NODE]) ? el[IQ_NODE] : {};
	}

	function cloneNodeStoreTo(from, to) {
		to[IQ_NODE] = from[IQ_NODE];
	}

	function getTemplatizedTemplate(el) {
		const iqStore = getIqStore(el);
		const template = iqStore.template;

		// If template is missing, stop here and return null
		if (template === undefined || template === null) {
			console.error('Remember to set your $iq.template', el);
			return null;
		}

		const regex = new RegExp(BINDING, 'g');
		return template.replace(regex, '${$1}');
	}

	function patch(currentEl, futureEl, isRoot = false) {
		if (!currentEl || !futureEl) return;

		// Sync stores
		const currentStore = getNodeStore(currentEl);
		const futureStore = getNodeStore(futureEl);
		if (futureStore.runtimeContext) {
			currentStore.runtimeContext = Object.assign({}, currentStore.runtimeContext, futureStore.runtimeContext);
		}

		// Fast path: text nodes
		if (currentEl.nodeType === Node.TEXT_NODE && futureEl.nodeType === Node.TEXT_NODE) {
			if (currentEl.nodeValue !== futureEl.nodeValue) {
				currentEl.nodeValue = futureEl.nodeValue;
			}
			return;
		}

		// Sync live inputs safely
		const interactiveTags = ['INPUT', 'TEXTAREA', 'SELECT'];
		if (interactiveTags.includes(currentEl.tagName)) {
			if (futureEl.hasAttribute('value') && currentEl.value !== futureEl.value) {
				currentEl.value = futureEl.value;
			}
			if (currentEl.type === 'checkbox' || currentEl.type === 'radio') {
				if (currentEl.checked !== futureEl.checked) {
					currentEl.checked = futureEl.checked;
				}
			}
		}

		// Diff attributes
		if (currentEl.attributes && futureEl.attributes) {
			for (let attr of futureEl.attributes) {
				if (currentEl.getAttribute(attr.name) !== attr.value) {
					currentEl.setAttribute(attr.name, attr.value);
				}
			}
			for (let attr of currentEl.attributes) {
				if (!futureEl.hasAttribute(attr.name)) {
					currentEl.removeAttribute(attr.name);
				}
			}
		}

		// 2. Add `!isRoot` to the Component boundary check!
		// This stops the infinite loop by only blocking traversal on children, not the root component.
		if (!isRoot && currentEl.tagName && COMPONENTS.has(currentEl.tagName.toLowerCase())) {
			const iq = getIqStore(currentEl);
			if (iq && iq.refreshInputs) {
				iq.refreshInputs();
				iq.ping();
			}
			return;
		}

		// Diff children
		const currentChildren = Array.from(currentEl.childNodes);
		const futureChildren = Array.from(futureEl.childNodes);
		const max = Math.max(currentChildren.length, futureChildren.length);

		for (let i = 0; i < max; i++) {
			const currChild = currentChildren[i];
			const futChild = futureChildren[i];

			if (!currChild && futChild) {
				currentEl.appendChild(futChild);
			} else if (currChild && !futChild) {
				currentEl.removeChild(currChild);
			} else if (currChild && futChild) {
				if (currChild.nodeType !== futChild.nodeType || (currChild.tagName && currChild.tagName !== futChild.tagName)) {
					currentEl.replaceChild(futChild, currChild);
				} else {
					// Notice we don't pass `true` here, so `isRoot` defaults to false for children!
					patch(currChild, futChild);
				}
			}
		}
	}

	function evaluateEventBindings(el) {
		if (!el.dataset) return;
		for (const dataset in el.dataset) {
			if (dataset.startsWith(DS_IQ_EVENT)) {
				const eventType = dataset.split(DS_IQ_EVENT).pop();
				const eventValue = el.dataset[dataset];

				delete el.dataset[dataset];

				const baseContext = getNodeStore(el).baseStore.baseContext;
				let evaluatedCallback;

				// Fast path: check if the string perfectly matches a class method.
				// If it does, bypass saferEval entirely.
				if (baseContext && typeof baseContext[eventValue] === 'function') {
					evaluatedCallback = baseContext[eventValue];
				} else {
					evaluatedCallback = saferEvalValue(eventValue, el);
				}

				if (evaluatedCallback && typeof evaluatedCallback === 'function') {
					el.addEventListener(eventType, (event) => {
						evaluatedCallback.call(baseContext, event, getNodeStore(el).runtimeContext);
					});
				} else {
					console.warn(`Could not bind event "${eventType}". Property "${eventValue}" is not a function.`);
				}
			}
		}
	}

	function evaluateTextBindings(el) {
		if (el.nodeType !== Node.TEXT_NODE) return;
		el.textContent = saferEvalText(el.textContent, el);
	}

	function evaluateAttributeBindings(el) {
		if (!el.attributes) return;
		for (const { name: attr, value } of [...el.attributes]) {
			// Handle boolean DOM properties like data-iq.disabled or data-iq.checked
			if (attr.startsWith('data-iq.')) {
				const prop = attr.split('data-iq.')[1];

				// Skip structural directives, we already handled these
				if (prop === 'for' || prop === 'if') continue;

				const evalValue = saferEvalValue(value, el);

				// Set the live DOM property (checkboxes/inputs)
				el[prop] = !!evalValue;

				// Set the HTML attribute for CSS styling logic
				if (evalValue) {
					el.setAttribute(prop, prop);
				} else {
					el.removeAttribute(prop);
				}
				continue;
			}

			if (attr.startsWith('data-iq:')) continue;

			el.setAttribute(attr, saferEvalText(value, el));
		}
	}

	function evaluateTemplateToLeaf(template, el) {
		const newWrapper = el.cloneNode(false);
		cloneIqStoreTo(el, newWrapper);
		cloneNodeStoreTo(el, newWrapper);
		newWrapper.innerHTML = template;

		const applyContextCascade = (node) => {
			if (!node[IQ_NODE] || !node[IQ_NODE].baseStore) {
				generateNodeStore(node);

				if (node.parentNode === newWrapper) {
					// Boundary crossing: Direct children of a component must inherit the Component's internal store ($iq), not the external node store ($iqn) passed by the parent.
					node[IQ_NODE].baseStore = getIqStore(newWrapper);
					node[IQ_NODE].runtimeContext = Object.assign({}, getNodeStore(newWrapper).runtimeContext);
				} else if (node.parentNode) {
					// Ensure the parent is initialized first, then inherit exactly what it has.
					if (!node.parentNode[IQ_NODE] || !node.parentNode[IQ_NODE].baseStore) {
						applyContextCascade(node.parentNode);
					}
					const parentStore = getNodeStore(node.parentNode);
					node[IQ_NODE].baseStore = parentStore.baseStore;
					node[IQ_NODE].runtimeContext = Object.assign({}, parentStore.runtimeContext);
				} else {
					// Fallback
					node[IQ_NODE].baseStore = getIqStore(newWrapper);
					node[IQ_NODE].runtimeContext = Object.assign({}, getNodeStore(newWrapper).runtimeContext);
				}
			}
		};

		let structuralNodes = Array.from(newWrapper.querySelectorAll('[data-iq\\.for], [data-iq\\.if]'));
		while (structuralNodes.length > 0) {
			const child = structuralNodes[0];

			applyContextCascade(child);

			let removed = false;
			if (child.dataset['iq.if']) {
				const evalIf = saferEvalValue(child.dataset['iq.if'], child);
				child.removeAttribute('data-iq.if');
				delete child.dataset['iq.if'];

				if (!evalIf) {
					child.remove();
					removed = true;
				}
			}

			if (!removed && child.dataset['iq.for']) {
				evaluateForInput(child, child.dataset['iq.for']);
			}

			structuralNodes = Array.from(newWrapper.querySelectorAll('[data-iq\\.for], [data-iq\\.if]'));
		}

		for (const child of recursivelyGetChildren(newWrapper)) {
			applyContextCascade(child);

			evaluateTextBindings(child);
			evaluateAttributeBindings(child);
			evaluateEventBindings(child);
		}

		return newWrapper;
	}

	function reflectTemplateToDom(el) {
		const iqStore = getIqStore(el);
		const templatizedTemplate = getTemplatizedTemplate(el);

		if (templatizedTemplate === null) return;

		iqStore.templatizedTemplate = templatizedTemplate;
		const evaluatedNode = evaluateTemplateToLeaf(templatizedTemplate, el);

		patch(el, evaluatedNode, true);

		// Manage lifecycle hooks.
		const instance = iqStore.baseContext;
		if (typeof instance.$iqOnChange === 'function') {
			instance.$iqOnChange();
		}
		if (!iqStore.mounted) {
			iqStore.mounted = true;
			if (typeof instance.$iqOnMount === 'function') {
				// We use queueMicrotask to ensure the browser has finished
				// the DOM layout so querySelectors are 100% reliable.
				queueMicrotask(() => instance.$iqOnMount());
			}
		}

		// CHANGE: Wait until the patch is done before hydrating children
		queueMicrotask(() => hydrate());
	}

	function initializeComponent(selector, classRef, el) {
		generateIqStore(el);
		const iqStore = getIqStore(el);
		iqStore.mounted = false; // Track component mount state
		iqStore.inputs = []; // Track registered inputs
		let isPending = false;

		function dispatch(event, data, elementRef = undefined) {
			const normalizedEvent = event.toLowerCase();
			(elementRef || el).dispatchEvent(new CustomEvent(normalizedEvent, {
				detail: data,
				bubbles: true,
				cancelable: true,
			}));
		}

		function input(_input) {
			if (!iqStore.inputs.includes(_input)) iqStore.inputs.push(_input);

			const inputValueStr = `${DS_IQ_INPUT}${_input}`;
			const inputValue = el.dataset[inputValueStr];
			if (getNodeStore(el).runtimeContext && inputValue) {
				iqStore.baseContext[_input] = getNodeStore(el).runtimeContext[inputValue];
			}
		}

		function ping() {
			if (isPending) return;
			isPending = true;

			// queueMicrotask tells the browser: "Do this as soon as the current script finishes"
			queueMicrotask(() => {
				reflectTemplateToDom(el);
				isPending = false;
			});
		}

		function template(_template) {
			iqStore.template = _template;
			setTimeout(() => {
				reflectTemplateToDom(el);
			});
		}

		function loadTemplate(_url) {
			fetch(_url)
				.then(response => response.text())
				.then(t => {
					template(t);
				});
		}

		function unwrapEvent(event) {
			return event.detail;
		}

		const injectors = Object.freeze({
			$iq: { dispatch, input, ping, template, loadTemplate, unwrapEvent, elementRef: el }
		});

		const instance = new classRef(injectors);
		Object.assign(instance, iqStore.baseContext);
		// Create a Proxy to handle "magic" updates
		iqStore.baseContext = new Proxy(instance, {
			set(target, prop, value) {
				// Only trigger if the value actually changed
				if (target[prop] !== value) {
					target[prop] = value;
					ping(); // Automatically re-render
				}
				return true;
			}
		});
		iqStore.refreshInputs = () => iqStore.inputs.forEach(i => input(i));
		iqStore.ping = ping;

		if(iqStore.template) {
			ping();
		   // reflectTemplateToDom(el);
		}
	}

	function hydrate() {
		for (const [selector, classRef] of COMPONENTS) {
			for (const el of document.querySelectorAll(selector)) {
				if (getIqStore(el).initialized) continue;
				initializeComponent(selector, classRef, el);
			}
		}
	}

	function register(componentDefinitions) {
		for (const [selector, classRef] of Object.entries(componentDefinitions)) {
			if (COMPONENTS.has(selector)) {
				console.warn(`${selector} is already registered to ${COMPONENTS.get(selector).name}`);
				continue;
			}
			COMPONENTS.set(selector, classRef);
		}
		hydrate();
	}

	return { register, hydrate, Component };
})();

if (typeof document !== 'undefined') {
	const DOM_PAGE_LOADED = new Promise(resolve => {
		document.addEventListener('DOMContentLoaded', () => resolve());
		if (document.readyState === 'interactive' || document.readyState === 'complete') {
			resolve();
		}
	});

	DOM_PAGE_LOADED.then(() => dom.hydrate());
}
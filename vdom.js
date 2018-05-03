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

iqwerty.vdom = (() => {
	/**
	 * The current state of the DOM, as VirtualElements.
	 */
	let _currentState;

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
		console.log(root, newVdom, oldVdom);

		if(!oldVdom) {
			console.log('adding child');
			root.appendChild(_toElements(newVdom));
		} else if(!newVdom) {
			console.log('removing child');
			root.removeChild(root.childNodes[childIndex]);
		} else if(_elementChanged(newVdom, oldVdom)) {
			console.log('replacing child');
			root.replaceChild(_toElements(newVdom), root.childNodes[childIndex]);
		} else if(newVdom instanceof VirtualElement) {
			console.log('diffing children');
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
	 * Render input HTML by transforming it to VirtualElements.
	 * @param {String} html Some HTML.
	 * @param {Node} to The element to render to.
	 */
	function Render(html, to) {
		const root = to;

		_currentState = _parseStringToHtml(html).map(_toVirtualElements);
		const els = _currentState.map(_toElements);
		els.forEach(el => {
			root.appendChild(el);
		});

		// There may be multiple siblings in the root, so the VirtualElements are later wrapped in a single VirtualElement. The actual root is wrapped in a container too, so that its children match up with the VirtualElements when patching later.
		const container = document.createElement(CONTAINER_TAG);
		root.parentNode.insertBefore(container, root);
		container.appendChild(root);
	}

	/**
	 * Update the page with the given HTML.
	 * @param {Node} to The element to render updates to.
	 */
	function Update(html, to) {
		const root = to;
		const newVdom = _parseStringToHtml(html).map(_toVirtualElements);
		const oldVdom = _currentState;

		// Wrap the old and new nodes in a container. This is because we may have multiple siblings in the root, but patching algo only works on 1 root node.
		const newNode = new VirtualElement(undefined, undefined, ...newVdom);
		const oldNode = new VirtualElement(undefined, undefined, ...oldVdom);

		// Because everything is wrapped, the root node must be the container, which is the wrapper of the root.
		const newRootNode = root.parentElement;
		if(newRootNode.tagName.toLowerCase() !== CONTAINER_TAG) {
			throw new Error(`Something went wrong. The parent of ${root} is not a <${CONTAINER_TAG}>.`);
		}

		// Now we can patch the DOM.
		_patch(newRootNode, newNode, oldNode);

		// Remember to update the current state lol. Otherwise further patches will be against the first render.
		_currentState = newVdom;
	}

	return {
		Render,
		Update
	};
})();
/***********************************************

  "util.js"

  Created by Michael Cheng on 5/24/2020 3:04:06 PM
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/

'use strict';

/**
 * Traverses the DOM tree iteratively and returns a flat array of all descendant nodes.
 * Optimized to maintain standard top-to-bottom, left-to-right document order.
 */
export function recursivelyGetChildren(el) {
	const children = [];
	const stack = Array.from(el.childNodes).reverse();

	while(stack.length) {
		const node = stack.pop();
		children.push(node);

		if (node.childNodes && node.childNodes.length) {
			stack.push(...Array.from(node.childNodes).reverse());
		}
	}

	return children;
}

export function saferEval(js, context = {}) {
	if(!js) return undefined;

	try {
		const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
		// FIX: We must block strict mode reserved words from becoming parameter names!
		const reserved = new Set([
			'eval', 'arguments', 'do', 'if', 'in', 'for', 'let', 'new', 'try', 'var',
			'case', 'else', 'enum', 'null', 'this', 'true', 'void', 'with',
			'await', 'break', 'catch', 'class', 'const', 'false', 'super', 'throw',
			'while', 'yield', 'delete', 'export', 'import', 'public', 'return',
			'static', 'switch', 'typeof', 'default', 'extends', 'finally', 'package',
			'private', 'continue', 'debugger', 'function', 'interface',
			'protected', 'implements', 'instanceof', 'NaN', 'Infinity', 'undefined'
		]);

		const keys = [];
		const values = [];
		const seenKeys = new Set();

		let currentObj = context;

		while (currentObj && currentObj !== Object.prototype) {
			for (const key of Object.getOwnPropertyNames(currentObj)) {
				// Prevent duplicates, check regex, and verify it is not a reserved JS keyword
				if (!seenKeys.has(key) && validIdentifierRegex.test(key) && !reserved.has(key)) {
					seenKeys.add(key);
					keys.push(key);
					values.push(context[key]);
				}
			}
			currentObj = Object.getPrototypeOf(currentObj);
		}

		const evaluator = new Function(...keys, `"use strict"; ${js}`);
		return evaluator(...values);

	} catch(e) {
		console.error('JS Execution Error:', e, '\nCode:', js, '\nContext:', context);
		return undefined;
	}
}
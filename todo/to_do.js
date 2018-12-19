/* exported ToDoApp */
/* global Component */
'use strict';

class ToDoApp extends Component {
	constructor({ loadTemplate, elementRef }) {
		super();
		loadTemplate('to_do.html').for(this);

		this.elementRef = elementRef;
		/**
		 * @type {Array<{
		 *       label: string;
		 *       edit: boolean;
		 *       complete: boolean;
		 * }>}
		 */
		this.items = [];
	}

	add() {
		const input = this.elementRef.querySelector('input.todo');
		this.items.push({ label: input.value, edit: false, complete: false });
		input.value = '';
		input.focus();
	}

	edit(item, event) {
		item.edit = true;
		const host = event.currentTarget;
		host.querySelector('input[type=text]').select();
	}

	doneEditing(item, event) {
		const host = event.currentTarget;
		item.label = host.value;
		item.edit = false;
	}

	toggleComplete(item, event) {
		item.complete = !item.complete;
		event.stopPropagation();
	}
}
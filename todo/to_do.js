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

		/** @type {Boolean} Specifies whether or not the main input is empty. */
		this.isEmpty = true;
	}

	setEmpty(event) {
		const host = event.currentTarget;
		this.isEmpty = host.value === '';
	}

	add() {
		const input = this.elementRef.querySelector('input.todo');
		this.items.push({ label: input.value, edit: false, complete: false });
		input.value = '';
		input.focus();
		this.isEmpty = true;
	}

	clear() {
		this.items = [];
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
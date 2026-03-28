/* exported ToDoApp */
/* global iqwerty */
'use strict';

class ToDoApp extends iqwerty.dom.Component {
	constructor({ $iq }) {
		super();
		this.$iq = $iq;
		this.items = [
			{ label: 'Hello!', complete: true, edit: false },
		];
		this.isEmpty = true;

		$iq.loadTemplate('to_do.html');
	}

	setEmpty(event) {
		this.isEmpty = event.target.value.trim() === '';
	}

	add() {
		const input = this.$iq.elementRef.querySelector('input.todo');
		const val = input.value.trim();

		if (val) {
			this.items.push({ label: val, complete: false, edit: false });
			input.value = '';
			this.isEmpty = true;
			input.focus();
		}
	}

	clear() {
		this.items = [];
		this.$iq.ping();
	}

	handleDelete(event, payload) {
		const todoToDelete = payload; // Or this.$iq.unwrapEvent(event))
		this.items = this.items.filter(item => item.label !== todoToDelete.item.label);
		this.$iq.ping();
	}
}


class ToDoItem extends iqwerty.dom.Component {
	constructor({ $iq }) {
		super();
		this.$iq = $iq;
		$iq.input('todo');
		$iq.loadTemplate('to_do_item.html');
	}

	toggleComplete() {
		this.todo.complete = !this.todo.complete;
		this.$iq.ping();
	}

	edit() {
		this.todo.edit = true;
		this.$iq.ping();

		const host = this.$iq.elementRef;
		setTimeout(() => {
			const textInput = host.querySelector('input[type="text"]');
			if (textInput) textInput.select();
		}, 0);
	}

	doneEditing(event) {
		const val = event.target.value.trim();
		if (val) {
			this.todo.label = val;
		}
		this.todo.edit = false;
		this.$iq.ping();
	}

	deleteItem() {
		this.$iq.dispatch('itemDeleted', this.todo);
	}
}

iqwerty.dom.register({
	'to-do-app': ToDoApp,
	'to-do-item': ToDoItem,
});
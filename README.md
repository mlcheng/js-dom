# js-dom

A lightweight templating framework with DOM diffing. Perfect for web apps (maybe)!

Cool points:

* Zero dependencies!
* Incrementally patches changes onto the DOM
* Works how you want it to (hopefully)
* Lots of bugs
* No IE support :(

A demo is available on my [playground](https://playground.michaelcheng.us/lib-js/dom/).

## Usage
This framework uses "components" to get its work done.

First, the component tag **must** be in `kebab-case`. Any tag without dashes will be ignored, since they may be native HTML elements.

```html
<timer-app></timer-app>
```

Somewhere in your page, a `TimerApp` controller must exist, and it must extend `iqwerty.dom.Component`. Remember to call `super()`. You must register the tag / component mapping:

```js
class TimerApp extends Component {
	constructor({ $iq }) {
		super();
		// Save the injector reference so methods can use it later. More on this below.
		this.$iq = $iq;

		this.time = {
			seconds: 0
		};

		this.start();
	}

	start() {
		setInterval(() => {
			this.time.seconds++;
		}, 1000);
	}
}

iqwerty.dom.register({
	'timer-app': TimerApp
});
```

### The `$iq` injection

The `$iq` utility is injected into your component's controller. It includes the following features:

#### `template(string)`

Set the template for your component and trigger a render cycle.

```js
this.$iq.template('<div>Hello {{name}}</div>');
```

#### `loadTemplate(url)`

Dynamically fetch a URL and sets it as the component template.

```js
this.$iq.loadTemplate('template.html');
```

#### `ping()`

Trigger a render cycle. For deep mutations (nested objects), this should be called manually to trigger re-render.

```js
this.nested.object = false;
this.$iq.ping();
```

*In case you're curious, this framework works by observing enumerable properties of an object. Sometimes, weird things like nested `Map`s don't get observed well. Changes to those nested values may not propagate correctly to the framework.*

#### `elementRef`

Gets a reference to the component's root node.

```js
this.$iq.elementRef.select();
```

#### `input(prop)`

Define the property string as an input to the component. This allows parents to pass data to its child components.

```js
this.$iq.input('items');
```

```html
<child-component data-iq.items="items"></child-component>
```

#### `dispatch(event, payload, referenceElement)`

Fire a custom event up the tree to pass data to parents from children. The event is emitted from the component root element. The referenceElement is the element that emits the event. If not specified, the event will be emitted by the component root node.

```js
this.$iq.dispatch('deleteItem', itemData);
```

#### `unwrapEvent(event)`

Unwraps the custom event by returning the payload.

```js
this.$iq.unwrapEvent(event);
```

### Data binding

Data binding is achieved using brackets in the template, and the template should be provided in the `$iq` property of `Component`.

```js
constructor() {
	super();

	this.$iq.template('{{time.seconds}} seconds have passed');
}
```

You can use whatever you need get the template.

```js
constructor() {
	super();

	this.$iq.template = fs.readFileSync('path/to/template.html', 'utf8');
}
```

Retrieving templates dynamically should work too.

```js
constructor() {
	super();

	iqwerty.template.GetTemplate('path/to/template.html', template => {
		this.$iq.template(template);
	});
}
```

The framework also provides an easy way to load templates dynamically.

For simplicity and ease of understanding, in the rest of the document we will assume that the template is already set without manually declaring it in the JavaScript.

## Advanced usage
The framework also includes many other powerful features that you probably didn't know about!

### Event handling

Events handled by the framework are known as `IQ events`. You can specify these by the syntax `data-iq:event`, where `event` is any HTML event.

```html
<element data-iq:event="handler"></element>
```

The handler receives the custom event and the component context. The event can be unwrapped to reveal the custom event payload using `unwrapEvent()`, which is just `event.detail` under the hood.

### Directives

There are structural directives to manipulate the DOM.

#### `.if`

Optionally render a node.

```html
<element data-iq.if="enabled">Enabled</element>
<element data-iq.if="!enabled">Disabled</element>
```

#### `.for`

Render a list of items.

```html
<element data-iq.for="item of items">
	<span>{{item}}</span>
</element>
```

The expression is "safely" evaluated using a prepended `const`, so the expression `item of items` is actually evaluated as:

```js
for(const item of items) {}
```

ಠ_ಠ

### Property bindings

State can be bound directly to DOM attributes, such as boolean properties on elements.

```html
<input type="checkbox" data-iq.checked="isComplete">
<button data-iq.disabled="isDisabled">Search</button>
```

### Component inputs

Structured data can be passed from parent to children through inputs.

```html
<user-profile data-iq.user="currentUser"></user-profile>
```

```js
class UserProfile extends iqwerty.dom.Component {
	constructor({ $iq }) {
		$iq.input('user');
	}
}
```

`user` is then accessible on the `UserProfile` component.

## Concepts

### Component communication

Parents pass data to children through `input`s, and children pass data up via custom events.

```js
class ChildItem extends iqwerty.dom.Component {
	constructor({ $iq }) {
		super();
		this.$iq = $iq;
		this.$iq.input('task'); // Accepts `this.task` from parent

		this.$iq.template(`
			<li>
				{{task.name}}
				<button data-iq:click="remove">X</button>
			</li>
		`);
	}

	remove() {
		// Dispatches a 'delete' event up the tree.
		this.$iq.dispatch('delete', this.task);
	}
}

class ParentList extends iqwerty.dom.Component {
	constructor({ $iq }) {
		super();
		this.$iq = $iq;
		this.tasks = [{ name: 'Eat' }, { name: 'Sleep' }];

		this.$iq.template(`
			<ul>
				<child-item
					data-iq.for="item of tasks"
					data-iq.task="item"
					data-iq:delete="handleDelete">
				</child-item>
			</ul>
		`);
	}

	handleDelete(event, elementRef, payload) {
		const deletedTask = this.$iq.unwrapEvent(event); // or payload
		this.tasks = this.tasks.filter(t => t !== deletedTask);
		this.$iq.ping();
	}
}
```

### Lifecycle hooks
The component lifecycle is important to understand if you want to do any DOM manipulation with the `elementRef`.

#### `$iqOnMount`
The component and its child views are now mounted to the DOM and available to modify.

```js
constructor({ elementRef }) {
	super();

	this.elementRef = elementRef;
}

$iqOnMount() {
	const delete = this.elementRef.querySelector('delete');
	// Do something with `delete`.
}
```

#### `$iqOnChange`
Called when changes are detected. Unfortunately at this time, we do not know what changed. This should probably be fixed in the future...

```js
constructor() {
	super();
}

$iqOnChange() {
	console.log('Change detected!');
}
```

## Style guide
It's quite funny to have a style guide for such a small framework. But... oh well.

### Framework first
Always write the `data-iq` attributes before any normal HTML attributes.

```html
<!-- Do this. -->
<button
	data-iq.disabled="isInvalid"
	class="remove">
		remove
</button>

<!-- Not this. -->
<button
	class="remove"
	data-iq.disabled="isInvalid">
		remove
</button>
```

## The To Do app
Every JavaScript framework needs a [To Do app](http://todomvc.com/) to show how awesome it is.

See ours [here](https://playground.michaelcheng.us/lib-js/dom/todo/). Read carefully -- this is also the gold-standard on how to create web apps using our framework.

## Gotchas
* The components are `eval`uated with a (slight) attempt at securing the context.
* There are no tests.
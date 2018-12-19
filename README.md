# js-dom

A lightweight templating framework with DOM diffing. Perfect for web apps (maybe)!

Cool points:

* Zero dependencies!
* Incrementally patches changes onto the DOM
* Works how you want it to (hopefully)
* Lots of bugs
* No IE support :(

A demo is available on my [playground](https://www.michaelcheng.us/playground/lib-js/dom/).

## Usage
This framework uses "components" to get its work done. There is some magic in creating a component.

First, the component tag **must** be in `snake-case`. Any tag without dashes will be ignored, since they may be native HTML elements.

```html
<timer-component></timer-component>
```

Somewhere in your page, a `TimerComponent` controller must exist, and it must extend `Component`. Remember to call `super()`. The mapping from `<timer-component>` to `TimerComponent` is magic (well... it's just `snake-case` to `PascalCase`), and you don't have to explicitly bind this.

```js
class TimerComponent extends Component {
    constructor() {
        super();

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
```

Data binding is achieved using brackets in the template, and the template should be provided in the `$iq` property of `Component`.

```js
constructor() {
    super();

    this.$iq.template = '{{time.seconds}} seconds have passed'.
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
        this.$iq.template = template;
    });
}
```

The framework provides an easy way to load templates dynamically. This is described below in the utility injection section below.

For simplicity and ease of understanding, in the rest of the document we will assume that the template is already set without manually declaring it in the JavaScript.

## Advanced usage
The framework also includes many other powerful features that you probably didn't know about!

### Utility injection
The component controller has a few dependencies that can be injected by the framework.

#### Detector
The `detector` reveals a single method: `ComponentShouldChange()`. Use this when the view should be updated based on state changes, but it failed to work automagically.

```js
constructor({ detector }) {
    this.time = new Map();
    this.time.set('something', {
        seconds: 0
    });

    setTimeout(() => {
        this.time.get('something').seconds++;
        detector.ComponentShouldChange();
    }, 1000);
}
```

*In case you're curious, this framework works by observing enumerable properties of an object. Sometimes, weird things like nested `Map`s don't get observed well. Changes to those nested values may not propagate correctly to the framework.*

#### Component element
The component controller can inject the component element itself as a native DOM element.

```js
constructor({ elementRef }) {}
```

#### Dynamic template loader
Uses `fetch` to dynamically load a component template.

```js
constructor({ loadTemplate }) {
    loadTemplate('path/to/template.html').for(this);
}
```

This utility abstracts away the assignment of the template to `this.$iq.template`. In the future, the template should be a `Promise`, that way it's much more explicit and there's less magic (which is good for readability):

```js
constructor({ loadTemplate }) {
    // THIS IS NOT SUPPORTED YET!
    this.$iq.template = loadTemplate('path/to/template.html');
}
```

### Event handling
Events handled by the framework are known as `IQ events`. You can specify these by the syntax `data-iq:event`, where `event` is any HTML event.

```html
<p>{{this.time.seconds}} seconds have passed!</p>
<button data-iq:click="reset()">Reset timer</button>
```

```js
class TimerComponent extends Component {
    constructor() {
        super();

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

    reset() {
        this.time.seconds = 0;
    }
}
```

If you need to get the actual `Event` that fired, inject the magic variable `$iqEvent` in your template.

```html
<input type="text" data-iq:click="selectText($iqEvent)">
```

```js
selectText(event) {
    event.currentTarget.select();
}
```

This could just be simplified to:

```js
<input type="text" data-iq:click="$iqEvent.currentTarget.select()">
```

...if you know what's going on behind the scenes.

### Directives
This framework supports some directives (similar to Angular) that make it easier to manipulate your DOM.

#### `.if`
Optionally render a node based on a given boolean value. If false, the node will not appear in the DOM.

*Actually, for performance reasons and ease of diffing, the node will __not__ be in the DOM, but it will be replaced by an HTML comment. See the source for details.*

```html
<div>
    <img data-iq.if="this.isLoggedIn" src="/path/to/profile_picture.jpg">
    <a data-iq.if="!this.isLoggedIn" href="/login">Login</a>
</div>
```

```js
class ProfilePictureComponent extends Component {
    constructor() {
        super();

        this.isLoggedIn = false;
        this.login();
    }

    login() {
        fetch('/api/login').then(() => {
            this.isLoggedIn = true;
        }).catch(() => {
            this.isLoggedIn = false;
        });
    }
}
```

#### `.for`
Render a list of elements.

```html
<ul>
    <li data-iq.for="item of items">{{item}}</li>
</ul>
```

```js
class ItemComponent extends Component {
    constructor() {
        super();

        this.items = [1, 2, 3];
    }
}
```

The expression is "safely" evaluated using a prepended `const`, so the expression `item of items` is actually evaluated as:

```js
for(const item of items) {}
```

ಠ_ಠ

### Inputs
Components can receive arbitrary data as inputs. The syntax is the same as directives, meaning you cannot have an input that has the same name as a directive. It just **won't** work.

This is fairly similar to Angular, but it's not as good (obviously). Let's re-write the `ItemComponent` using inputs.

```js
class AppComponent extends Component {
    constructor() {
        super();

        this.items = [1, 2, 3];
        this.$iq.template = `
            <item-component data-iq.items="items"></item-component>
        `;
    }
}

class ItemComponent extends Component {
    constructor() {
        super();

        this.$iq.template = `
            <ul>
                <li data-iq.for="item of items">{{item}}</li>
            </ul>
        `;

        // You don't have to write this annotation, but it's probably good practice for you to understand what's actually going on. I'm planning on making a wrapper for this that automatically puts the input onto the class context.
        /** @input */
        this.items;
    }
}
```

### Dynamically loading components
**TODO: Check if this is still right.**

If you're lazy loading things (and you should), this framework exposes only one method, and it's to help render a lazy-loaded component. `iqwerty.vdom.Load()` takes in a reference to an HTML element and instantiates it.

```js
iqwerty.vdom.Load(document.getElementById('lazy-loaded-section'));
```

## The To-Do app
Every JavaScript framework needs a [To-Do app](http://todomvc.com/) to show how awesome it is. Here is ours. Read carefully -- this is also the gold-standard on how to create web apps using our framework.

```html
<ul>
    <li
        data-iq.for="item of items"
        data-iq:click="edit(item, $iqEvent)"
        class="{{item.complete ? 'strike' : ''}}">
            <input
                type="text"
                value="{{item.label}}"
                data-iq.if="item.edit"
                data-iq:blur="doneEditing(item, $iqEvent)">
            <span data-iq.if="!item.edit">{{item.label}}</span>
            <input
                type="checkbox"
                data-iq:click="toggleComplete(item, $iqEvent)">
    </li>
</ul>

<input type="text" class="todo">
<button data-iq:click="add()">add</button>
```

```js
class ToDoApp extends Component {
    constructor({ loadTemplate, elementRef }) {
        super();
        loadTemplate('to_do_app.html').for(this);

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
        this.items.push({
            label: input.value,
            edit: false,
            complete: false
        });
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
```

And just put it onto your page with:

```html
<!doctype html>
<html>
    <head>
        <meta charset="utf-8">
        <title>To-Do</title>
        <script src="dom.js"></script>
    </head>
    <body>
        <to-do-app></to-do-app>
    </body>
</html>
```

You can see some version of this on my [playground](https://www.michaelcheng.us/playground/lib-js/dom/todo/)

## Gotchas
* The components are `eval`uated with a (slight) attempt at securing the context.
* There are no tests.
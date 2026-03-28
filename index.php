<?php
/***********************************************

  "index.php"

  Created by Michael Cheng on 03/28/2026 14:04
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/

require_once(__DIR__ . '/../../demo/classes/DemoPage.php');

$page = (new DemoPage())
	->setProjectType('js')
	->setProjectName('dom')
	->render();
?>

<section>
	<p>
		An extension of js-binding that allows for DOM manipulation, similar to frameworks like Angular or Vue.
	</p>

	<div data-relevant>
		<demo-app></demo-app>
	</div>

	<pre></pre>

	<script data-relevant>
		'use strict';

		class DemoApp extends iqwerty.dom.Component {
			constructor({ $iq }) {
				super();
				this.$iq = $iq;
				this.name = "Michael";
				this.items = [1, 2, 3];

				// No need for this delay normally, this is just for the demo.
				setTimeout(() => {
					$iq.template(`
						Hello {{name}}!
						<ul data-iq:onDelete="removeItem">
							<demo-item data-iq.for="item of items" data-iq.item="item"></demo-item>
						</ul>
					`);
				}, 0);

			}

			removeItem(event, context) {
				const item = this.$iq.unwrapEvent(event);
				this.items = this.items.filter(i => i !== item);
				this.$iq.ping();
			}
		}

		class DemoItem extends iqwerty.dom.Component {
			constructor({ $iq }) {
				super();
				this.$iq = $iq;

				// Define inputs
				$iq.input('item');

				$iq.template(`
					<li data-iq:click="removeItem">{{item}}</li>
				`);
			}

			removeItem() {
				this.$iq.dispatch('onDelete', this.item);
			}
		}

		iqwerty.dom.register({
			'demo-app': DemoApp,
			'demo-item': DemoItem,
		});
	</script>
</section>

<?php $page->close(); ?>
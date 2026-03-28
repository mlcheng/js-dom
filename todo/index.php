<?php
/***********************************************

  "index.php"

  Created by Michael Cheng on 12/18/2018 16:52
            http://michaelcheng.us/
            michael@michaelcheng.us
            --All Rights Reserved--

***********************************************/
?>
<!doctype html>
<html>
<head>
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta charset="utf-8">
	<title>To Do</title>
	<style>
		body {
			font-family: sans-serif;
		}

		div {
			color: rgba(0, 0, 0, .5);
			padding: 1em;
		}

		ul {
			list-style: none;
		}

		li {
			padding: .3em;
		}

		li:hover {
			background: rgba(0, 0, 0, .05);
			cursor: pointer;
		}

		.strike {
			text-decoration: line-through;
		}

		button, input {
			border: 1px solid rgba(0, 0, 0, .1);
			border-radius: 3px;
			padding: .3em;
		}

		button:focus, input:focus {
			border: 1px solid rgba(0, 0, 0, .25);
			outline: none;
		}

		button {
			background: #42a5f5;
			color: white;
			padding: .3em .5em;
			transition: background 200ms, filter 200ms;
		}

		button:focus {
			filter: brightness(90%);
		}

		button:not([disabled]):hover {
			cursor: pointer;
		}

		button.remove {
			background: #f44336;
		}

		button[disabled] {
			background: rgba(0, 0, 0, .2);
		}

		footer {
			padding: 2em 0;
		}
	</style>
	<script src="../dom.min.js"></script>
	<script src="to_do.js"></script>
</head>
<body>
	<h1>My to do list</h1>
	<to-do-app></to-do-app>

	<footer>
		<a href="https://github.com/mlcheng/js-dom/tree/master/todo">
			View the source!
		</a>
	</footer>
</body>
</html>
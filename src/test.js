var http = require('http');
var server = http.createServer(requestHandler);
var io = require('socket.io')(server);
var fs = require('fs');
var util = require('util');
var querystring = require('querystring');
server.listen(1337);

function requestHandler(req, res) {
	console.log("url: " + req.url);
	console.log("method: " + req.method);
	console.log("data: " + req.data);
	switch(req.url) {
		case '/':
			console.log("POST request recieved");
			/*req.on('data', function(chunk) {
				console.log(chunk);
				console.log(querystring.parse(chunk.toString()));
				console.log("something");

			});*/
			res.writeHead(200);
			res.end('{"response" : "Thanks for the POST request!"}');
			console.log("Something2");
			break;
		case '/formhander':
			console.log("Request submited through a form");
			res.end("That was a form I think...");
			break;
		default:
			console.log("GET request recieved");
			res.end("Thanks for the GET request!");
	}
}

io.on('connection', newConnection);
function newConnection(socket) {
	console.log("socket established");	
}
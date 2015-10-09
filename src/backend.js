var http		= require('http');
var server 		= http.createServer(requestHandler);
var io			= require('socket.io')(server);
var fs			= require('fs');
var mysql		= require('mysql');
var queryString	= require('querystring');
var lineReader  = require('line-reader'); //Might need to move to function
var conn = connectToDatabase();
conn.connect(function(error) {
	if(error) 	{ console.log("Unable to connect to database");}
	else 		{ console.log("Connected to database")		 ;}
});
var users = {}; //id->socket
var idToClient = {};

server.listen(1337);


/**
 * Handle requests to the server
 */
function requestHandler(req, res) {
	console.log("request recieved | " + req.method + " | " + req.url);
	if(req.method === "POST") {
		switch(req.url) {
			//POST
			case('backendDB.php'):
			case('/'):
				req.on('data', function(chunk){
					ajaxRequestHandler(chunk, req, res);
				});
				break;
			//POST via form
			case('/formhandler'):
				res.end("Not supported");
				break;
			//GET
			default:
				res.end("Not supported");
		}
	} else {
		//GET
		serveChatroomHTML(req, res);
	}
}

function serveChatroomHTML(req, res) {
	var filename = "chatroom.html";
	console.log(req.url);
	switch(req.url){
		case('/'):
			filename = "chatroom.html";
			break;
		case('/chatInterface.js'):
			filename = "chatInterface.js";
			break;
		case('/controller.js'):
			filename = "controller.js";
			break;
		case('/backendInterface.js'):
			filename = "backendInterface.js";
			break;
	}
	fs.readFile(filename, function(err, data) {
		if(!err) {
			res.end(data);
		} else {
			console.log("Error reading file...");
			console.log(err);
		}
	});
}

function ajaxRequestHandler(chunk, req, res) {
	var data = queryString.parse(chunk.toString());
	if(data.function === undefined) {
		console.log("Request with no funciton");
		replyMissingInputs(res);
		return;
	}
	
	if(data.function == "login") {
		login(data, req, res);
		return;
	}
	
	if(data.token === undefined) {
		console.log("Request with no token");
		replyMissingInputs(res);
		return;
	} 
	
	console.log(data.function);
	if (data.function === 'profile:info:chats') {
		executeSecureFunction(data, req, res,prepGetChatIDs);
	} else if (data.function === 'chat:retrieve:last') {
		executeSecureFunction(data, req, res, prepRetrieveLastNMessages);
	} else if (data.function === 'chat:retrieve:range') {
		executeSecureFunction(data, req, res, prepGetMessageRange)
	} else if(data.function === 'chat:send:message') {
		executeSecureFunction(data, req, res, prepSendMessage);
	} else if (data.funciton === 'login') {
		console.log("dog");
		login(data, req, res);
	}
}

/**
 * Socket connection event. Store connection by the id
 */
io.on('connection', newConnection);
function newConnection(socket) {
	console.log("socket established");
	socket.on('set token', function(data) {
		authenticate(data['token'], function(id) {
			if(id === undefined) {
				console.log("socket attempted with invalid token");
				socket.disconnect();
				socket.close();
			} else {
				idToClient[id] = socket;
			}
		});
	});
	users[socket.id] = socket;	
}

/**
 * Authenticates with token. Call callback with id, or undefined if unable to authenticate
 * @param {String} Token to use
 * @param {Function} Function to call after getting id
 */
function authenticate(token, callback) {
	console.log("Authenticating with token: " + token);
	var query = "SELECT `user_id` FROM `sessions` WHERE `token` = '" + token + "' LIMIT 1";
	conn.query(query, function(error, rows, fields){
		if(error) {
			console.log("error with query: " + error);
		} else {
			if(rows.length === 0) {
				console.log("Unable to authenticate");
				callback(undefined);
			} else {
				var id = rows[0]['user_id'];
				callback(id);
			}
		}
	});
}

/**
 * Authenticate. If valid ID produced, call postAuth
 */
function executeSecureFunction(data, req, res, postAuth) {
	authenticate(data.token, function(id) {
		if(!id) {
			res.end('{"success":false,"error":"Unable to authenticate"}');
			return;
		} else {
			postAuth(data, req, res, id);
		}
	});
}

function prepSendMessage(data, req, res, id) {
	if(!isRequiredSet(data, ['message', 'chatID'])) {
		replyMissingInputs(res);
		return;
	}
	var message = data['message'];
	var chatID = data['chatID'];
	
	sendMessage(res, id, message, chatID);
}

function sendMessage(res, userID, message, chatID) {
	getChatDataByChatID(chatID, function(error, rows) {
		if(error) {
			replyDatabaseError(res);
			return;
		}
		if(rows.length === 0) {
			replyChatNotFound(res);
			return;
		}
		var chatData = rows[0];
		//Current user not part of given chat
		if(!(userID === chatData['user_one'] || userID === chatData['user_two'])) {
			replyNoAccess(res);
			return; 
		}
		
		incrementChatMessagesAs(chatID, userID);
		
		var chatFilePath = getChatFilePath(chatID);
		
	});
}

/**
 * Prepare getting chatIDs
 */
function prepGetChatIDs(data, req, res, id) {
	getChatIds(data, req, res, id);
}
/**
 * Query database for chatIDs
 */
function getChatIds(data, req, res, id) {
	console.log("getting chat ids");
	//Fetch chat id's for given user id from database
	var query = "SELECT `chat_id` FROM `chats` WHERE `user_one` = '" + id + "' OR `user_two` = '" + id + "'";	
	conn.query(query, function(error, rows, fields) {
		if(error) {
			console.log("Error getting chats from database: " + error);
			res.end('{"success":false,"error":"error getting chats from database"}');
			return;
		} else {
			//Put chat ids into an array
			var chatIDs = [];
			for(var i=0; i<rows.length; i++) {
				chatIDs.push(rows[i]['chat_id']);
			}
			//Create log object of response data
			var log = {};
			log['success'] = true;
			log['response'] = "chat ids retrieved";
			log['chatIDs'] = chatIDs;
			console.log(chatIDs);
			res.end(JSON.stringify(log));
			return; 
		}
	});
}

function getChatDataByChatIDValidate(res, userID, chatID,successCallback) {
	getChatDataByChatID(chatID, function(error, rows){
		//Database query error
		if(error) {
			replyDatabaseError(res);
			return;
		}
		//chatID not found in database
		if(rows.length === 0) {
			replyChatNotFound(res);
			return;
		}
		var chatData = rows[0];
		//Current user not part of given chat
		if(!(userID === chatData['user_one'] || userID === chatData['user_two'])) {
			replyNoAccess(res);
			return;
		}
		
		successCallback(chatData);
	});
}

function loadMessagesFromFile(filePath, start, end, callback) {
	var lineNum = 0;
	var messages = [];
	lineReader.eachLine(filePath, function(line, last) {
			if(lineNum >= start) {
				messages.push(line);
			}
			lineNum += 1;
			if(last || lineNum >= end) {
				callback(messages);
			}
		});
}

function replyWithMessagesFromFile(res, filePath, start, end) {
	loadMessagesFromFile(filePath, start, end, function(messages) {
		//Build reply and send
		var log = {};
		log['success'] = true;
		log['messages'] = messages;
		log['response'] = "retrieved messages";
		res.end(JSON.stringify(log));
	})
}

function prepRetrieveLastNMessages(data, req, res, id) {
	if(!isRequiredSet(data, ['chatID','numMessages'])) {
		replyMissingInputs(res);
		return;
	}
	
	var chatID = data['chatID'];
	var numMessages = data['numMessages'];
	retrieveLastNMessages(res, id, chatID, numMessages)
}

function retrieveLastNMessages(res, userID, chatID, numMessages) {
	getChatDataByChatIDValidate(res, userID, chatID, function(chatData) {
		//Get last N messages. If less messages than requests, get all
		var start = chatData['num_messages'] - numMessages;
		var end = chatData['num_messages'];
		var filePath = getChatFilePath(chatID);
		replyWithMessagesFromFile(res, filePath, start, end);
	});
}

function prepGetMessageRange(data, req, res, id) {
	if(!isRequiredSet(data, ['chatID', 'begin', 'end'])) {
		replyMissingInputs(res);
		return;
	}
	
	var chatID = data['chatID'];
	var begin = data['begin'];
	var end = data['end'];
	getMessageRange(res, id, chatID, begin, end);
}

function getMessageRange(res, userID, chatID, begin, end){
	getChatDataByChatIDValidate(res, userID, chatID, function(chatData){
		var filePath = getChatFilePath(chatID);
		replyWithMessagesFromFile(res, filePath, begin, end);
	});
}

function getChatDataByChatID(chatID, callback) {
	var query = "SELECT * FROM `chats` WHERE `chat_id` = '" + chatID + "' LIMIT 1";
	conn.query(query, function(error, rows, fields) {
		callback(error, rows);
	});
}

function login(data, req, res) {
	console.log("user logging in");
	if(!isRequiredSet(data, ["email","password"])) {
		console.log("unable to log in...misssing inputs");
		replyMissingInputs(res);
		return;
	}
	var email = data['email'];
	var password = data['password'];
	var selectQuery = "SELECT `id` FROM `profiles` WHERE `email` = '" + email + "' AND `password` = '" + password + "'";
	
	var userID;
	conn.query(selectQuery, function(error, rows, fields) { 
		console.log(rows.length);
		if(rows.length == 0) {
			replyUserNotFound(res);
			return;
		}
		userID = rows[0]['id'];	
		
		//Delete other sessions
		var deleteQuery = "DELETE FROM `sessions` WHERE `user_id` = '" + userID + "'";
		conn.query(deleteQuery, function(error, rows, fields) {
			var uuid = generateUUID();
			var now = Date.now();
			var ipAddress = req.connection.remoteAddress;
			var insertQuery = "INSERT INTO `sessions` (`token`, `ip_address`, `user_id`, `created`, `updated`) VALUES ('" + uuid + "','" + ipAddress + "','" + userID + "','" + now + "','" + now + "')";
			conn.query(insertQuery, function(error, rows, fields) {
				console.log("Inserted successfully");
				console.log('{"success":true, "token":' + uuid + '}');
				res.end('{"success":true, "token":"' + uuid + '"}');
			});
		});
	});
}

/**
 * ----- UTILITY FUNCTIONS -----
 */
 
 function replyMissingInputs(res) {
	 res.end('{"success":false, "error":"missing inputs"}');
 }
 
 function replyDatabaseError(res) {
	 res.end('{"success":false, "error":"error with database query"}');
 }
 
 function replyChatNotFound(res) {
	 res.end('{"success":false, "error":"chat not found"}');
 }
 
 function replyNoAccess(res) {
	 res.end('{"success":false, "error":"acccess denied"}');
 }
 
 function replyUserNotFound(res) {
	 res.end('{"success":false, "error":"user not found"}');
 }
 
 function connectToDatabase() {
	var connection = mysql.createConnection({
  		host     : 'localhost',
		user     : 'root',
		password : '',
		database : 'speakeasy'
	});
	return connection;
}
 
function isRequiredSet(data, required) {
	for(var i =0; i < required.length; i++) {
		if(data[required[i]] === undefined) {
			return false;
		}
	}
	return true; 
} 


function generateUUID() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + s4() + s4() +
    s4() + s4() + s4() + s4();
}

function getChatFilePath(chatID) {
	return "chats/" + chatID + ".chat";
}

/**
 * Increments the unread of the opposite user by amount, and the message count by amount. 
 */
function incrementChatMessagesAs(chatID, userID, amount) {
	var query = "UPDATE `chats` SET `num_messages` = `num_messages` + " + amount + "," +
									 "`unread_user_one` = CASE WHERE WHEN `user_two` = '" + userID + "' THEN `unread_user_one + " + amount + " ELSE `unread_user_one` END," +
									 "`unread_user_two` = CASE WHEN `user_one` = '" + userID + "' THEN `unread_user_two` + " + amount + " ELSE `unread_user_two` END" + 
									 "WHERE `chat_id` = '" + chatID + "' LIMIT 1";
	conn.query(query, function(error, rows, fields) {
		if(error) {
			console.log("error incrementing chat:\n\tchat: " + chatID + "\n\tas user: " + userID + "\n\tamount: " + amount);
		}
	})
}
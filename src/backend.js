var http		= require('http');
var server 		= http.createServer(requestHandler);
var io			= require('socket.io')(server);
var fs			= require('fs');
var mysql		= require('mysql');
var queryString	= require('querystring');
var lineReader  = require('line-reader'); //Might need to move to function
var util = require('util');
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
	if(req.method === "POST") {
		switch(req.url) {
			case('/backendDB.php'):
			case('/'):
				req.on('data', function(chunk){
					ajaxRequestHandler(chunk, req, res);
				});
				break;
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
		case('/main.css'):
			filename = "main.css";
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
	} else if(data.function == "signup") {
		signup(data, req, res);
		return;
	}
	
	if(data.token === undefined) {
		console.log("Request with no token");
		replyMissingInputs(res);
		return;
	} 
	
	if (data.function === 'profile:info:chats') {
		executeSecureFunction(data, req, res,prepGetChatIDs);
	} else if (data.function === 'chat:retrieve:last') {
		executeSecureFunction(data, req, res, prepRetrieveLastNMessages);
	} else if (data.function === 'chat:retrieve:range') {
		executeSecureFunction(data, req, res, prepGetMessageRange)
	} else if(data.function === 'chat:send:message') {
		executeSecureFunction(data, req, res, prepSendMessage);
	} else if(data.function === 'createChat') {
		executeSecureFunction(data, req, res, createChat);
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
	getChatDataByChatIDValidate(res, userID, chatID, function(chatData) {

		//Update chat meta data
		incrementChatMessagesAs(chatID, userID, 1,function(success) {
			if(!success) {
				replyDatabaseError(res);
				return;
			}
			var messageObject = {};
			messageObject['index'] = chatData['num_messages'] + 1;
			messageObject['message'] = message;
			messageObject['sent'] = (new Date()).toDateString();
			messageObject['sender'] = userID;
			var messageEncoded = JSON.stringify(messageObject);
			var filePath = getChatFilePath(chatID);
			fs.appendFile(filePath, messageEncoded + '\n', function (err) {
				if(err) {
					console.log("error writing message " + err);
				}
			});
			res.end('{"success":true, "response":"message sent", "message":' + messageEncoded + '}');
			var otherUserID = chatData['user_one'] == userID ? chatData['user_two'] : chatData['user_one'];
			if(idToClient[otherUserID] !== undefined) {
				idToClient[otherUserID].emit('newMessage', {'chatID' : chatID, 'message' : messageEncoded});
			}
		});		
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
	var lineNum = 1;
	var messages = [];
	var callbackTriggered = false;
	console.log("fetching messages: " + filePath);
	lineReader.eachLine(filePath, function(line, last) {
		console.log(lineNum);
		if(lineNum >= start && lineNum <= end) {
			messages.push(line);
		}
		if(last || lineNum >= end) {
			console.log("done fetching");
			callback(messages);
			callbackTriggered = true;
			return false;
		}
		lineNum += 1;
	}).then(function (error) {
		console.log(error);
		if(!callbackTriggered) {
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
		var start = chatData['num_messages'] - numMessages + 1;
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

function signup(data, req, res) {
	console.log("user signing up");
	console.log(data);
	if(!isRequiredSet(data, ['firstName','lastName','email','password'])) {
		replyMissingInputs(res);
		return;
	}
	
	var firstName = data['firstName'];
	var lastName = data['lastName'];
	var email = data['email'];
	var password = data['password'];
	
	var existingAccountQuery = util.format("SELECT `email` FROM `profiles` WHERE `email` = '%s' LIMIT 1",email);
	conn.query(existingAccountQuery, function(error, rows, fields) {
		if(error) {
			console.log("Error checking for existing account: " + error);
			replyDatabaseError(res);
			return;
		}
		if(rows.length !== 0) {
			replyAlreadyRegistered(res);
			return;
		}
		
		var userID = generateUUID();
		var insertAccountQuery = util.format("INSERT INTO `profiles` (`id`, `first_name`, `last_name`, `email`, `password`) VALUES ('%s', '%s', '%s', '%s', '%s')", userID, firstName, lastName, email, password);
		conn.query(insertAccountQuery, function(error, rows, fields) {
			if(error) {
				console.log("Error adding account to database: " + error);
				replyDatabaseError(res);
				return;
			} else {
				res.end('{"success":true, "response": "account created"}');
			}
		});
	});
}

function createChat(data, req, res, userID) {
	if(!isRequiredSet(data, ['otherEmail'])) {
		replyMissingInputs(res);
		return;
	}
	var otherEmail = data['otherEmail'];
	var validOtherEmailQuery = util.format("SELECT `id` FROM `profiles` WHERE `email` = '%s'", otherEmail);
	conn.query(validOtherEmailQuery, function(error, rows, fields) {
		if(error) {
			console.log("Error validating other email " + error);
			replyDatabaseError(res);
			return;
		}
		if(rows.length === 0) {
			replyUserNotFound(res);
			return;
		}
		
		var otherID = rows[0]['id'];
		var chatNotCreatedQuery = util.format("SELECT `chat_id` FROM `chats` WHERE (`user_one` = '%s' AND `user_two` = '%s') OR (`user_one` = '%s' AND `user_two` = '%s') LIMIT 1", userID, otherID, otherID, userID);		
		conn.query(chatNotCreatedQuery, function(error, rows, fields) {
			if(error) {
				console.log("Error checking for existing chat " + error);
				replyDatabaseError(res);
				return;
			}
			if(rows.length !== 0) {
				replyChatAlreadyExists(res);
				return;
			}
			
			var chatID = generateUUID();
			var chatInsertQuery = util.format("INSERT INTO `chats` (`chat_id`, `user_one`, `user_two`) VALUES ('%s', '%s', '%s')", chatID, userID, otherID);
			conn.query(chatInsertQuery, function(error, rows, fields){
				if(error) {
					console.log("Error creating chat " + error);
					replyUserNotFound(res);
					return;
				}
				var filePath = getChatFilePath(chatID);
				fs.closeSync(fs.openSync(filePath, 'w'));
				res.end(util.format('{"success":true, "response":"chat created", "newChatID":"%s"}', chatID));
			});
		});
	});1

}1

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
 
 function replyErrorWritingToFile(res) {
	 res.end('{"success":false, "error":"unable to write to file"}');
 }
 
 function replyAlreadyRegistered(res) {
	 res.end('{"success":false, "error":"account already registered"}')
 }
 
 function replyChatAlreadyExists(res) {
	 res.end('{"success":false, "error":"chat already exists"}');
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
function incrementChatMessagesAs(chatID, userID, amount, callback) {
	var query = "UPDATE `chats` SET `num_messages` = `num_messages` + " + amount + "," +
									 "`unread_user_one` = CASE WHEN `user_two` = '" + userID + "' THEN `unread_user_one` + " + amount + " ELSE `unread_user_one` END," +
									 "`unread_user_two` = CASE WHEN `user_one` = '" + userID + "' THEN `unread_user_two` + " + amount + " ELSE `unread_user_two` END" + 
									 " WHERE `chat_id` = '" + chatID + "' LIMIT 1";
	conn.query(query, function(error, rows, fields) {
		if(error) {
			console.log("error incrementing chat:\n\tchat: " + chatID + "\n\tas user: " + userID + "\n\tamount: " + amount);
			console.log(error);
			callback(false);
		} else {
			callback(true);
		}
	})
}
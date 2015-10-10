/* global token */

var loginStatsAreaId = "";
var loginSignupAreaId = "loginAreaSignupArea";
var chatSelectionAreaId = "chatSelectionArea";
var chatAreaId = "chatArea";
var messagesAreaId = "messagesArea";
var chatSelectMenuId = "chatSelectionMenu";
var chats;
var loggedInEmail;
var token;

var currentChatId;
var loadedMessages;
var minIndex;
var maxIndex;
var socket;

function init() {
    if (token === undefined) {
        setLoginStatus("Not logged in", "red");
        setElementVisibility(loginSignupAreaId, true);
        setElementVisibility(chatSelectionAreaId, false);
        setElementVisibility(chatAreaId, false);
        clearMessagesArea();
        clearChatSelectionArea();
    } else {
        setElementVisibility(loginSignupAreaId, false);
        setElementVisibility(chatSelectionAreaId, true);
        setElementVisibility(chatAreaId, true);
        clearChatSelectionArea();
        getChatIDs(function (data) {
            if (data.success === false) {
                console.log("Error getting chats");
            } else {
                bindChatSelectMenu(data.chatIDs);
            }
        });
    }
}

function login() {
    var email = document.getElementById('email').value;
    var password = document.getElementById('password').value;
    attemptLogin(email, password, function (data) {
        if (data.success) {
            token = data.token;
            loggedInEmail = email;
            setLoginStatus("Logged in as: " + loggedInEmail, "green");
            init();
            socket = io.connect('http://localhost:1337');
            socket.on('newMessage', function(data) {
                console.log(data);
                addMessagesToBottomOfMessageArea([data.message], true);
            });
            socket.emit('set token',{'token' : token});
        } else {
            setLoginStatus("Error logging in", "red");
        }
    });
}

function chatSelected() {
    var chatSelectMenu = document.getElementById(chatSelectMenuId);
    var chatId = chatSelectMenu.options[chatSelectMenu.selectedIndex].value;
    if (chatId !== "null") {
        loadChat(chatId);
    }
}

function loadChat(chatId) {
    console.log("loading chat: " + chatId);
    clearChatArea();
    currentChatId = chatId;
    loadedMessages = {};
    getInitialMessages(chatId, 15, function (success, info, messages) {
        if (success) {
            console.log(messages[0]);
            addMessagesToBottomOfMessageArea(messages, true);
            minIndex = parseInt(JSON.parse(messages[0]).index);
            maxIndex = parseInt(JSON.parse(messages[14]).index);
        } else {
            console.log("Unable to load messages: " + info);
        }
    });
}

function loadMoreMessages(numMessages) {
    var begin = minIndex - numMessages - 1;
    var end = minIndex - 1;
    getMessageRange(currentChatId, begin, end, function (success, info, messages) {
        if (!success) {
            console.log("error loading more messages : " + info);
            return;
        }
        var chatArea = document.getElementById(chatAreaId);
        var oldMessages = chatArea.innerHTML;
        chatArea.innerHTML = "";
        for (var i = 0; i < messages.length; i = i + 1) {
            var message = JSON.parse(messages[i]);
            loadedMessages[message.index] = message;
            var messageDiv = createMessageDiv(message);
            chatArea.appendChild(messageDiv);
        }
        chatArea.innerHTML += oldMessages;
        
        minIndex = JSON.parse(messages[0]).index;
    });
}

function prepSendMessage() {
    var messageToSend = document.getElementById("message").value;
    sendMessage(currentChatId, messageToSend, function(success, info, message) {
        console.log(message);
        if(success) {
            maxIndex = maxIndex + 1;
            addMessagesToBottomOfMessageArea([message], false);
        } else {
            console.log("Unable to send message: " + info);
        }
    });
}

function bindChatSelectMenu(chatIds) {
    chats = {};
    var chatSelectMenu = document.getElementById(chatSelectMenuId);

    var option = document.createElement("option");
    option.value = "null";
    option.innerHTML = "--- Select a Chat ---";
    chatSelectMenu.appendChild(option);

    for (var i = 0; i < chatIds.length; i++) {
        var option = document.createElement("option");
        option.value = chatIds[i];
        option.innerHTML = chatIds[i];
        chatSelectMenu.appendChild(option);
    }
}

function setElementVisibility(elementId, visible) {
    var element = document.getElementById(elementId);
    if (visible) {
        element.style.visibility = "visible";
        element.style.display = "block";
    } else {
        element.style.visibility = "hidden";
        element.style.display = "none";
    }
}

function clearMessagesArea() {
    document.getElementById(messagesAreaId).innerHTML = "";
}

function clearChatSelectionArea() {
    document.getElementById("chatSelectionMenu").innerHTML = "";

}

function setLoginStatus(text, color) {
    var loginStatus = document.getElementById('loginStatusArea');
    loginStatus.style.color = color;
    loginStatus.innerHTML = text;
}

function createMessageDiv(message) {
    var div = document.createElement("div");
    div.innerHTML = message.sender + ": " + message.message;
    return div;
}

function addMessagesToBottomOfMessageArea(messages, decode) {
    var chatArea = document.getElementById(chatAreaId);
    for (var i = 0; i < messages.length; i++) {
        var message = decode ? JSON.parse(messages[i]) : messages[i];
        loadedMessages[message.index] = message;

        var messageDiv = createMessageDiv(message);
        chatArea.appendChild(messageDiv);
    }
}
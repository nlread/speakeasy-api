/* global token */

var loginStatsAreaId = "";
var loginSignupAreaId = "loginAreaSignupArea";
var chatManagementAreaId = "chatManagementArea";
var chatSelectionAreaId = "chatSelectionArea";
var chatAreaId = "chatArea";
var messagesAreaId = "messagesArea";
var chatSelectMenuId = "chatSelectionMenu";
var createChatStatusAreaId = "createChatStatusArea";
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
        setElementVisibility(chatManagementAreaId, false);
        setElementVisibility(chatAreaId, false);
        clearMessagesArea();
        clearChatSelectionArea();
    } else {
        setElementVisibility(loginSignupAreaId, false);
        setElementVisibility(chatManagementAreaId, true);
        setElementVisibility(chatAreaId, true);
        clearChatSelectionArea();
        getChatIDs(function (data) {
            if (data.success === false) {
                console.log("Error getting chats");
            } else {
                chats = data.chatIDs;
                bindChatSelectMenu();
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
            socket.on('newMessage', function (data) {
                console.log(data);
                addMessagesToBottomOfMessageArea([data.message], true);
                scrollToBottomOfChat();
            });
            socket.emit('set token', {'token': token});
        } else {
            setLoginStatus("Error logging in", "red");
        }
    });
}

function signup() {
    var firstName = document.getElementById('firstNameSignup').value;
    var lastName = document.getElementById('lastNameSignup').value;
    var email = document.getElementById('emailSignup').value;
    var password = document.getElementById('passwordSignupOne').value;
    attemptSignup(firstName, lastName, email, password, function (success, info) {
        if (success) {
            setLoginStatus(info, "green");
        } else {
            setLoginStatus(info, "red");
        }
    });
}

function createChat() {
    var otherEmail = document.getElementById('emailChatCreate').value;
    attemptCreateChat(otherEmail, function(success, info, chatID) {
        if(success) {
            chats.push(chatID);
            setCreateChatStatus(info, "green");
            bindChatSelectMenu(currentChatId);
        } else {
            setCreateChatStatus(info, "red");
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
    clearMessagesArea();
    currentChatId = chatId;
    loadedMessages = {};
    getInitialMessages(chatId, 15, function (success, info, messages) {
        if (success) {
            console.log(messages[0]);
            addMessagesToBottomOfMessageArea(messages, true);
            minIndex = messages.length === 0 ? 0 : parseInt(JSON.parse(messages[0]).index);
            maxIndex = messages.length === 0 ? 0 : parseInt(JSON.parse(messages[14]).index);
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
        var messagesArea = document.getElementById(messagesAreaId);
        var oldMessages = messagesArea.innerHTML;
        messagesArea.innerHTML = "";
        for (var i = 0; i < messages.length; i = i + 1) {
            var message = JSON.parse(messages[i]);
            loadedMessages[message.index] = message;
            var messageDiv = createMessageDiv(message);
            messagesArea.appendChild(messageDiv);
        }
        messagesArea.innerHTML += oldMessages;

        minIndex = messages.length === 0 ? 0 : JSON.parse(messages[0]).index;
    });
}

function prepSendMessage() {
    var messageToSend = document.getElementById("message").value;
    sendMessage(currentChatId, messageToSend, function (success, info, message) {
        console.log(message);
        if (success) {
            maxIndex = maxIndex + 1;
            addMessagesToBottomOfMessageArea([message], false);
            scrollToBottomOfChat();
        } else {
            console.log("Unable to send message: " + info);
        }
    });
}

function bindChatSelectMenu(chatToSelect) {
    
    var chatSelectMenu = document.getElementById(chatSelectMenuId);
    chatSelectMenu.innerHTML = "";
    var option = document.createElement("option");
    option.value = "null";
    option.innerHTML = "--- Select a Chat ---";
    chatSelectMenu.appendChild(option);

    for (var i = 0; i < chats.length; i++) {
        var option = document.createElement("option");
        option.value = chats[i];
        option.innerHTML = chats[i];
        chatSelectMenu.appendChild(option);
    }
    
    if(chatToSelect !== undefined) {
        for (var i = 0; i < chatSelectMenu.options.length; i++) {
        if (chatSelectMenu.options[i].text === valueToSet) {
            chatSelectMenu.options[i].selected = true;
            break;
        }
    }
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

function setCreateChatStatus(text, color) {
    var createChatStatusDiv = document.getElementById(createChatStatusAreaId);
    createChatStatusDiv.innerHTML = text;
    createChatStatusDiv.style.color = color;
}

function createMessageDiv(message) {
    var div = document.createElement("div");
    div.innerHTML = message.sender + ": " + message.message;
    return div;
}

function addMessagesToBottomOfMessageArea(messages, decode) {
    var messagesArea = document.getElementById(messagesAreaId);
    for (var i = 0; i < messages.length; i++) {
        var message = decode ? JSON.parse(messages[i]) : messages[i];
        loadedMessages[message.index] = message;

        var messageDiv = createMessageDiv(message);
        messagesArea.appendChild(messageDiv);
    }
}

function scrollToBottomOfChat() {
    var messagesArea = document.getElementById(messagesAreaId);
    messagesArea.scrollTop = messagesArea.scrollHeight;
}
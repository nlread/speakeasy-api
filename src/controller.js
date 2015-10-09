/* global token */

var loginStatsAreaId = "";
var loginAreaId = "loginArea";
var chatSelectionAreaId = "chatSelectionArea";
var chatAreaId = "chatArea";
var chatSelectMenuId = "chatSelectionMenu";
var chats;
var loggedInEmail;
var token;
var currentChatId;
var messages;

function init() {
   if(token === undefined) {
        setLoginStatus("Not logged in", "red");
        setElementVisibility(loginAreaId, true);
        setElementVisibility(chatSelectionAreaId, false);
        setElementVisibility(chatAreaId, false);
        clearChatArea();
        clearChatSelectionArea();
   } else {
        setElementVisibility(loginAreaId, false);
        setElementVisibility(chatSelectionAreaId, true);
        setElementVisibility(chatAreaId, true);
        clearChatSelectionArea();
        getChatIDs(function(data) {
            if(data.success === false) {
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
    attemptLogin(email, password, function(data) {
        if(data.success) {
            token = data.token;
            loggedInEmail = email;
            setLoginStatus("Logged in as: " + loggedInEmail, "green");
            init();
        } else {
            setLoginStatus("Error logging in", "red");
        }
    });
}

function chatSelected() {
    var chatSelectMenu = document.getElementById(chatSelectMenuId);
    var chatId = chatSelectMenu.options[chatSelectMenu.selectedIndex].value;
    if(chatId !== "null") {
        loadChat(chatId);
    }
}

function loadChat(chatId) {
    console.log("loading chat: " + chatId);
    //clearChatArea();
    currentChatId = chatId;
    messages = {};
    getInitialMessages(chatId, 15, function(success, info, messages) {
        if(success) {
            var chatArea = document.getElementById(chatAreaId);
            for(var i=0; i < messages.length; i++) {
                var messageDiv = document.createElement("div");
                var message = JSON.parse(messages[i]);
                messages[message.index] = message;
                messageDiv.innerHTML = message.sender + ": " + message.message;
                chatArea.appendChild(messageDiv);
            }
        } else {
            console.log("Unable to load messages: " + info);
        }
    });
}

function loadMoreMessages(numMessages) {
        
}

function bindChatSelectMenu(chatIds) {
    chats = {};
    var chatSelectMenu = document.getElementById(chatSelectMenuId);
    
    var option = document.createElement("option");
        option.value =  "null";
        option.innerHTML = "--- Select a Chat ---";
    chatSelectMenu.appendChild(option);
    
    for(var i=0; i < chatIds.length; i++) {
        var option = document.createElement("option");
            option.value =  chatIds[i];
            option.innerHTML = chatIds[i];
        chatSelectMenu.appendChild(option);
    }
}



function setElementVisibility(elementId, visible) {
    var element = document.getElementById(elementId);
    if(visible) {
        element.style.visibility = "visible";
        element.style.display = "block";
    } else {
        element.style.visibility = "hidden";
        element.style.display = "none";
    }
}

function clearChatArea() {
    document.getElementById(chatAreaId).innerHTML = "";
}

function clearChatSelectionArea() {
    document.getElementById("chatSelectionMenu").innerHTML = "";

}
function setLoginStatus(text, color) {
    var loginStatus = document.getElementById('loginStatusArea');
    loginStatus.style.color = color;
    loginStatus.innerHTML = text;
}
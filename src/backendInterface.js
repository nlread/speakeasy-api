/* 
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */


/* global token */

//<editor-fold defaultstate="collapsed" desc="Normal Functions">

// <editor-fold defaultstate="collapsed" desc="Login">
function attemptLogin(email, password, callback) {
    console.log("" + email + " " + password);
    $.ajax({
        type: "POST", 
        url: "/",
        data : {
            'function' : "login",
            'email': email,
            'password' : password
        },
        dataType: "json",
        success: callback
    });
}
//</editor-fold>

// </editor-fold defaultstate="collpased" desc="Attempt Signup"

function attemptSignup(firstName, lastName, email, password, callback) {
    console.log(firstName + " " + lastName + " " + email + " " + password);
    $.ajax({
        type: "POST",
        url: "/",
        data: {
            'function': "signup",
            'firstName': firstName,
            'lastName': lastName,
            'email': email,
            'password': password
        },
        dataType: "json",
        success: function(json) {
            var data = convertToObject(json);
            if(data.success) {
                callback(data.success, data.error);
            } else {
                callback(data.success, data.response);
            }
        }
    });
}
// </editor-fold>

// <editor-fold defaultstate="collapsed" desc="Get Chat IDs">
/**
 * Gets the chat IDs for the user assosiated with the set token
 */
function getChatIDs(callback) {
    console.log("Getting Chat IDs");
    $.ajax({
        type: "POST",
        url: "/",
        data: {
            'token': token,
            'function': 'profile:info:chats'
        },
        dataType: "json",
        success: callback
    });
}
// </editor-fold>

//<editor-fold defaultstate="collpased" desc="Get Initial Messages">

function getInitialMessages(chatID, numMessages, callback) {
    console.log("getting messages for " + chatID);
    $.ajax({
        type: "POST",
        url: "/",
        data: {
            'function': 'chat:retrieve:last',
            'token': token,
            'numMessages': numMessages,
            'chatID': chatID
        },
        dataType: "json",
        success: function(json) {
            console.log(json);
            var data = convertToObject(json);
            if(data.success){
                callback(data.success, data.message, data.messages);
            } else {
                callback(data.success, data.error, null);
            }
        }
    });
}

//</editor-fold>

// <editor-fold defaultstate="collapsed" desc="Get Message Range">

function getMessageRange(chatID, beginIndex, endIndex, callback) {
    console.log("gettig messages from " + beginIndex + " to " + endIndex + " for " + chatID);
    $.ajax({
       type: "POST",
       url: "/",
       data: {
           'function': 'chat:retrieve:range',
           'token': token,
           'chatID': chatID,
           'begin': beginIndex,
           'end': endIndex
       },
       dataType: "json",
       success: function(json) {
           var data = convertToObject(json);
           if(data.success)
               callback(data.success, data.response, data.messages);
           else
               callback(data.success, data.error, null);
       }
    });
}
// </editor-fold>

// <editor-fold defaultstate="collpased" desc="Send Message">

/**
 * Sends a messages to the specified chatID
 * @param {String} chatID Chat to send message to
 * @param {String} message Message to send to chat
 * @returns 
 */
function sendMessage(chatID, message, callback) {
    $.ajax({
        type: "POST",
        url: "/",
        data: {'function': 'chat:send:message',
            'token': token,
            'chatID': chatID,
            'message': message
        },
        dataType: "json",
        success: function(json) {
            var data = convertToObject(json);
            if(data.success) {
                callback(data.success, data.response, data.message);
            } else {
                callback(data.success, data.error, data.message);
            }
        }
    });
}

// </editor-fold>
//</editor-fold>

// <editor-fold defaultstate="collapsed" desc="Utility Functions">
function convertToObject(json) {
    if (typeof json === "string") {
        return jQuery.parseJSON(json);
    } else {
        return json;
    }
}
// </editor-fold>
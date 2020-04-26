/*
firetable.js
firetable API wrapper
*/

var ftapi = {
  started: false,
  loggedIn: false,
  banned: false,
  presenceDetectRef: null,
  presenceDetectEvent: null,
  connectedRef: null,
  superCopBanUpdates: null,
  uname: null,
  uid: null,
  selectedListThing: "0",
  queueBind: null,
  queueRef: null,
  queue: null,
  users: {}
};

ftapi.ready = function() {
  ftapi.events = new EventEmitter();
};

ftapi.init = function(firebaseConfig) {
  console.log("Powered by firetable. \n" +
    "For more information, head to firetable.org");
  ftapi.started = true;

  // init firebase app
  firebase.initializeApp(firebaseConfig, "firetable");


  /*
  NON-AUTHENTICATED FIRETABLE EVENT BINDINGS
  All realtime events for the non-authenticated user
  These will persist regardless of auth state changes
  */

  // chat event emitter
  var chatRef = firebase.app("firetable").database().ref("chat");
  chatRef.on('child_added', function(childSnapshot, prevChildKey) {
    var chatData = childSnapshot.val();
    chatData.chatID = childSnapshot.key;
    ftapi.events.emit("newChat", chatData);
  });

  // users change event emitter
  var ref2 = firebase.app("firetable").database().ref("users");
  ref2.orderByChild('status').equalTo(true).on('value', function(dataSnapshot) {
    var okdata = dataSnapshot.val();
    ftapi.users = okdata;
    if (ftapi.users[ftapi.uid]) {
      if (ftapi.users[ftapi.uid].username) {
        ftapi.uname = ftapi.users[ftapi.uid].username;
      }
    }
    ftapi.events.emit("usersChanged", okdata);
    if (ftapi.uid) {
      if (!ftapi.users[ftapi.uid]) {
        //Firebase thinks you are not here (but you are totally here!)
        ftapi.presenceDetectRef = firebase.app("firetable").database().ref("users/" + ftapi.uid + "/status");
        ftapi.presenceDetectEvent = ftapi.presenceDetectRef.onDisconnect().set(false);
        ftapi.presenceDetectRef.set(true);
      } else {
        if (ftapi.users[ftapi.uid].supermod) {
          if (!ftapi.superCopBanUpdates) {
            //begin event listener for ban updates
            var ref = firebase.app("firetable").database().ref("banned");
            ftapi.superCopBanUpdates = ref.on('value', function(dataSnapshot) {
              ftapi.events.emit("banListChanged", dataSnapshot.val());
            });
          }
        }
      }
    }
  });

  // new song event emitter
  var s2p = firebase.app("firetable").database().ref("songToPlay");
  s2p.on('value', function(dataSnapshot) {
    var songData = dataSnapshot.val();
    ftapi.events.emit("newSong", songData);
  });

  // song tag update emitter
  var tagUpdate = firebase.app("firetable").database().ref("tagUpdate");
  tagUpdate.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("tagUpdate", data);
  });

  // history emitter
  var recentz = firebase.app("firetable").database().ref("songHistory");
  recentz.on('child_added', function(dataSnapshot, prev) {
    var data = dataSnapshot.val();
    data.histID = dataSnapshot.key;
    ftapi.events.emit("newHistory", data);
  });

  // table change emitter
  var tbl = firebase.app("firetable").database().ref("table");
  tbl.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("tableChanged", data);
  });

  // spotlight state changed emitter
  var pldx = firebase.app("firetable").database().ref("playdex");
  pldx.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("spotlightStateChanged", data);
  });

  // playlimit change emitter
  var plc = firebase.app("firetable").database().ref("playlimit");
  plc.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("playLimitChanged", data);
  });

  // waitlist change emitter
  var wl = firebase.app("firetable").database().ref("waitlist");
  wl.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("waitlistChanged", data);
  });

  // new theme emitter
  var themeChange = firebase.app("firetable").database().ref("theme");
  themeChange.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("newTheme", data);
  });

  // dance state emitter
  var danceCheck = firebase.app("firetable").database().ref("dance");
  danceCheck.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("danceStateChanged", data);
  });

  // screen sync change emitter
  var thescreen = firebase.app("firetable").database().ref("thescreen");
  thescreen.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("screenStateChanged", data);
  });

  var colors = firebase.app("firetable").database().ref("colors");
  colors.on('value', function(dataSnapshot) {
    var data = dataSnapshot.val();
    ftapi.events.emit("colorsChanged", data);
  });

  /*
  AUTHENTICATED FIRETABLE EVENT BINDINGS
  Realtime events for the authenticated user
  */
  firebase.app("firetable").auth().onAuthStateChanged(function(user) {
    if (!ftapi.loggedIn) {
      // YOU ARE NOT LOGGED IN YET. IF AUTHENTICATED, INIT LOGIN
      if (user) {
        ftapi.loggedIn = true; // this stays true until the logout function is called
        ftapi.connectedRef = firebase.app("firetable").database().ref('.info/connected');
        ftapi.connectedRef.on('value', function(snap) {
          if (snap.val() === true) {
            ftapi.presenceDetectRef = firebase.app("firetable").database().ref("users/" + user.uid + "/status");
            ftapi.presenceDetectEvent = ftapi.presenceDetectRef.onDisconnect().set(false);
            ftapi.presenceDetectRef.set(true);
          }
        });
        ftapi.uid = user.uid;
        ftapi.uname = user.uid;
        ftapi.events.emit("loggedIn", user);

        // setup ban check event emitters
        var banCheck = firebase.app("firetable").database().ref("banned/" + ftapi.uid);
        banCheck.on('value', function(dataSnapshot) {
          var data = dataSnapshot.val();
          if (data) {
            if (!ftapi.banned) {
              ftapi.banned = true;
              var ref0 = firebase.app("firetable").database().ref("users/" + ftapi.uid + "/status");
              ftapi.uid = null;
              ref0.set(false);
              ftapi.events.emit("userBanned");
            }
          } else if (ftapi.banned) {
            ftapi.events.emit("userUnbanned");
          }
        });

        /*
        SET UP QUEUE BIND
        */
        ftapi.lookup.selectedList(function(data) {
          ftapi.selectedListThing = data;
          if (data == 0) {
            ftapi.queueRef = firebase.app("firetable").database().ref("queues/" + ftapi.uid);
          } else {
            ftapi.queueRef = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + data + "/list");
          }

          // set up queueBind
          ftapi.queueBind = ftapi.queueRef.on('value', function(dataSnapshot) {
            var data = dataSnapshot.val();
            if (!data) data = {};
            ftapi.queue = data;
            ftapi.events.emit("playlistChanged", data);
          });

        });

        // set join date if needed
        var joinRef = firebase.app("firetable").database().ref("users/" + user.uid + "/joined");
        joinRef.once('value')
          .then(function(joinsnap) {
            var data = joinsnap.val();
            if (!data) {
              joinRef.set(firebase.database.ServerValue.TIMESTAMP);
            }
          });

      } else {
        // not logged in, not authenticated..
        // emit logged out state
        ftapi.events.emit("loggedOut");
      }
    } else {
      // user is already logged in.. treat these as disconnects and reconnects
      // authReconnected/authDisconnected emitters
      if (user) {
        ftapi.events.emit("authReconnected");
      } else {
        ftapi.events.emit("authDisconnected");
      }
    }
  });
};

/*
ACTIONS
*/
ftapi.actions = {
  /*
  GENERAL USER ACTIONS
  */
  sendChat: function(txt, cardid) {
    var chat = firebase.app("firetable").database().ref("chat");
    var data = {
      time: firebase.database.ServerValue.TIMESTAMP,
      id: ftapi.uid,
      txt: txt,
      name: ftapi.uname
    };
    if (cardid) data.card = cardid;
    chat.push(data);
  },
  switchList: function(listID) {
    var uref = firebase.app("firetable").database().ref("users/" + ftapi.uid + "/selectedList");
    uref.set(listID);
    ftapi.selectedListThing = listID;

    // update queue bind
    ftapi.queueRef.off("value", ftapi.queueBind); //stop listening for changes on old list

    // change queueRef to the new listID
    if (listID == "0") {
      ftapi.queueRef = firebase.app("firetable").database().ref("queues/" + ftapi.uid);
    } else {
      ftapi.queueRef = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + listID + "/list");
    }

    // setup new queueBind
    ftapi.queueBind = ftapi.queueRef.on('value', function(dataSnapshot) {
      var data = dataSnapshot.val();
      if (!data) data = {};
      ftapi.queue = data;
      ftapi.events.emit("playlistChanged", data);
    });

  },
  createList: function(listname) {
    var plref = firebase.app("firetable").database().ref("playlists/" + ftapi.uid);
    var newlist = plref.push();
    var listid = newlist.key;
    var obj = {
      name: listname,
      list: {}
    };
    newlist.set(obj);
    return listid;
  },
  addToList: function(type, name, cid, dest, callback) {
    var destref;
    if (dest) {
      if (dest == 0) {
        destref = firebase.app("firetable").database().ref("queues/" + ftapi.uid);
      } else {
        destref = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + dest + "/list");
      }
    } else {
      destref = ftapi.queueRef;
    }
    var info = {
      type: type,
      name: name,
      cid: cid
    };
    var newTrack = destref.push(info, function() {
      if (callback) callback();
    });
    return newTrack.key;
  },
  moveTrackToTop: function(trackID, preview, pvChangeCallback) {
    // this is a stupid way of doing this,
    // but i couldn't find a way to re-order a fb ref
    // or add to the top of it (fb has a push() but no unshift() equivalent)
    if (!ftapi.queue) return false;
    var okdata = ftapi.queue;
    var qtemp = [];
    var ids = [];
    var indx = false;
    var countr = 0;
    for (var key in okdata) {
      if (okdata.hasOwnProperty(key)) {
        var thisone = okdata[key];
        var obj = {
          data: thisone,
          key: key
        };
        qtemp.push(obj);
        ids.push(key);
        if (key == trackID) indx = countr;
        countr++;
      }
    }
    var newobj = {};
    if (indx) {
      var thingo = qtemp[indx];
      qtemp.splice(indx, 1); //take song out of temp array
      qtemp.unshift(thingo); //add it to the top
      var changePv = false;
      //now we have to rebuild the object keeping the oldkeys in the same order
      //we have to do it this way (i think) because firebase orders based on its ids
      for (var i = 0; i < qtemp.length; i++) {
        var theid = ids[i];
        if (preview) {
          if (preview == qtemp[i].key) {
            changePv = theid;
          }
        }
        newobj[theid] = qtemp[i].data;
      }
      if (changePv) pvChangeCallback(changePv);
      ftapi.queueRef.set(newobj); //send it off to firebase!
    }
  },
  moveTrackToBottom: function(trackID, callback) {
    var theTrack = ftapi.queue[trackID];
    ftapi.actions.deleteTrack(trackID, function() {
      var newID = ftapi.actions.addToList(theTrack.type, theTrack.name, theTrack.cid, false, function() {
        if (callback) return callback(newID);
      });
    });
  },
  deleteTrack: function(trackID, callback) {
    var removeThis = ftapi.queueRef.child(trackID);
    removeThis.remove()
      .then(function() {
        if (callback) return callback();
      });
  },
  unflagTrack: function(trackID) {
    var removeThis = ftapi.queueRef.child(trackID + "/flagged");
    removeThis.remove();
  },
  editTrackTag: function(trackID, cid, newTag) {
    if (ftapi.queue[trackID]) {
      if (ftapi.queue[trackID].cid == cid) {
        var changeref = ftapi.queueRef.child(trackID);
        var trackObj = ftapi.queue[trackID];
        trackObj.name = newTag;
        changeref.set(trackObj);
      } else {
        //song appears to have moved since the editing began, let's try and find it...
        for (var key in ftapi.queue) {
          if (ftapi.queue.hasOwnProperty(key)) {
            if (ftapi.queue[key].cid == cid) {
              var changeref = ftapi.queueRef.child(key);
              var trackObj = ftapi.queue[key];
              trackObj.name = newTag;
              changeref.set(trackObj);
              return;
            }
          }
        }
      }
    } else {
      //song appears to have moved since the editing began, let's try and find it...
      for (var key in ftapi.queue) {
        if (ftapi.queue.hasOwnProperty(key)) {
          if (ftapi.queue[key].cid == cid) {
            var changeref = ftapi.queueRef.child(key);
            var trackObj = ftapi.queue[key];
            trackObj.name = newTag;
            changeref.set(trackObj);
            return;
          }
        }
      }
    }
  },
  deleteList: function(listID) {
    var removeThis = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + listID);
    removeThis.remove();
  },
  mergeLists: function(source, dest, callback) {
    var destref;
    if (dest == 0) {
      destref = firebase.app("firetable").database().ref("queues/" + ftapi.uid);
    } else {
      destref = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + dest + "/list");
    }

    var sourceref;
    if (source == 0) {
      sourceref = firebase.app("firetable").database().ref("queues/" + ftapi.uid);
    } else {
      sourceref = firebase.app("firetable").database().ref("playlists/" + ftapi.uid + "/" + source + "/list");
    }
    // create dest obj to check for duplicates
    var destObj = {};
    destref.once("value")
      .then(function(snapshot2) {
        snapshot2.forEach(function(childSnapshot) {
          var key = childSnapshot.key;
          var childData = childSnapshot.val();
          if (childData) {
            if (childData.cid) destObj[childData.cid] = childData.type;
          }
        });
        sourceref.once("value")
          .then(function(snapshot3) {
            snapshot3.forEach(function(childSnapshot3) {
              var key = childSnapshot3.key;
              var childData = childSnapshot3.val();
              if (childData) {
                if (childData.cid) {
                  var dupe = false;
                  if (destObj[childData.cid]) {
                    if (childData.type == destObj[childData.cid]) dupe = true;
                  }
                  if (!dupe) {
                    // NOT A DUPLICATE! GO GO GO
                    destref.push(childData);
                  }
                }
              }

            });
            return callback();
          });
      });
  },
  shuffleList: function(preview, pvChangeCallback) {
    var okdata = ftapi.queue;
    var ids = [];
    var arr = [];
    for (var key in okdata) {
      if (okdata.hasOwnProperty(key)) {
        ids.push(key);
        arr.push(key);
      }
    }
    ftapi.utilities.shuffle(arr);
    var changePv = false;
    var newobj = {};
    for (var i = 0; i < arr.length; i++) {
      var songid = arr[i];
      var newspot = ids[i];
      var thisone = okdata[songid];
      newobj[newspot] = thisone;
      if (preview == songid) {
        changePv = newspot;
      }
    }
    if (changePv) pvChangeCallback(changePv);
    ftapi.queueRef.set(newobj);
  },
  removeDuplicatesFromList: function() {
    var okdata = ftapi.queue;
    var arr = [];
    for (var key in okdata) {
      if (okdata.hasOwnProperty(key)) {
        var entry = ftapi.queue[key];
        entry.key = key;
        arr.push(entry);
      }
    }
    var dupes = arr.filter((obj, pos, arr2) => {
      return arr2.map(mapObj => mapObj.cid).indexOf(obj.cid) !== pos;
    });
    for (var i = 0; i < dupes.length; i++) {
      ftapi.actions.deleteTrack(dupes[i].key);
    }
  },
  reorderList: function(arr, preview, pvChangeCallback) {
    if (!arr.length) return;
    if (arr.length !== ftapi.utilities.size(ftapi.queue)) return;
    var okdata = ftapi.queue;
    var ids = [];
    for (var key in okdata) {
      if (okdata.hasOwnProperty(key)) {
        ids.push(key);
      }
    }
    var changePv = false;
    var newobj = {};
    for (var i = 0; i < arr.length; i++) {
      var songid = arr[i];
      var newspot = ids[i];
      var thisone = okdata[songid];
      newobj[newspot] = thisone;
      if (preview == songid) {
        changePv = newspot;
      }
    }
    if (changePv) pvChangeCallback(changePv);
    ftapi.queueRef.set(newobj);
  },
  /*
  AUTH ACTIONS
  */
  logOut: function() {
    var ref0 = firebase.app("firetable").database().ref("users/" + ftapi.uid + "/status");
    ftapi.uid = null;
    ref0.set(false);
    ftapi.loggedIn = false;
    ftapi.events.emit("loggedOut");
    firebase.app("firetable").auth().signOut();
  },
  logIn: function(email, password, errorCallback) {
    firebase.app("firetable").auth().signInWithEmailAndPassword(email, password).catch(function(error) {
      return errorCallback(error);
    });
  },
  resetPassword: function(email, errorCallback) {
    firebase.app("firetable").auth().sendPasswordResetEmail(email).catch(function(error) {
      return errorCallback(error);
    });
  },
  signUp: function(email, password, errorCallback) {
    firebase.app("firetable").auth().createUserWithEmailAndPassword(email, password).catch(function(error) {
      var errorCode = error.code;
      var errorMessage = error.message;
      return errorCallback(error);
    });
  },
  /*
  ADMIN ACTIONS
  */
  unbanUser: function(userid) {
    var ref = firebase.app("firetable").database().ref("banned/" + userid);
    ref.set(false);
  },
  banUser: function(userid) {
    var ref = firebase.app("firetable").database().ref("banned/" + userid);
    ref.set(true);
  },
  modUser: function(userid) {
    var modp = firebase.app("firetable").database().ref("users/" + userid + "/mod");
    modp.set(true);
  },
  unmodUser: function(userid) {
    var modp = firebase.app("firetable").database().ref("users/" + userid + "/mod");
    modp.set(false);
  }
};

ftapi.lookup = {
  /*
  DATA LOOKUP FUNCTIONS
  */
  card: function(cardid, callback) {
    var thecard = firebase.app("firetable").database().ref("cards/" + cardid);
    thecard.once('value')
      .then(function(allQueuesSnap) {
        var data = allQueuesSnap.val();
        return callback(data);
      });
  },
  cardCollection: function(callback) {
    var niceref = firebase.app("firetable").database().ref("cards");
    niceref.orderByChild('owner').equalTo(ftapi.uid).once("value")
      .then(function(snapshot) {
        var cards = snapshot.val();
        return callback(cards);
      });
  },
  userByName: function(name, callback) {
    var searchByName = firebase.app("firetable").database().ref("users");
    var ppl = [];
    searchByName.orderByChild('username').equalTo(name).once("value")
      .then(function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
          var key = childSnapshot.key;
          var childData = childSnapshot.val();
          childData.userid = key;
          ppl.push(childData);
        });
        if (ppl[0]) {
          return callback(ppl[0]);
        } else {
          ftapi.lookup.userByID(name, callback);
        }
      });
  },
  userByID: function(userid, callback) {
    var searchByID = firebase.app("firetable").database().ref("users/" + userid);
    var person = null;
    searchByID.once("value")
      .then(function(snapshot2) {
        var childData2 = snapshot2.val();
        if (childData2) {
          var key2 = snapshot2.key;
          childData2.userid = key2;
          person = childData2;
        }
        return callback(person);
      });
  },
  selectedList: function(callback) {
    var getSelect = firebase.app("firetable").database().ref("users/" + ftapi.uid + "/selectedList");
    getSelect.once('value')
      .then(function(snappy) {
        data = snappy.val();
        if (!data) data = "0";
        return callback(data);
      });
  },
  allLists: function(callback) {
    var allQueues = firebase.app("firetable").database().ref("playlists/" + ftapi.uid);
    allQueues.once('value')
      .then(function(allQueuesSnap) {
        var allPlaylists = allQueuesSnap.val();
        return callback(allPlaylists);
      });
  }
};

/*
UTILITY FUNCTIONS
*/
ftapi.utilities = {
  // Modern Fisher-Yates shuffle
  shuffle: function(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      x = a[i];
      a[i] = a[j];
      a[j] = x;
    }
    return a;
  },
  size: function(obj) {
    var size = 0;
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) size++;
    }
    return size;
  }
};

/*
POLYFILL EVENT EMITTER
*/
var indexOf;

if (typeof Array.prototype.indexOf === 'function') {
  indexOf = function(haystack, needle) {
    return haystack.indexOf(needle);
  };
} else {
  indexOf = function(haystack, needle) {
    var i = 0,
      length = haystack.length,
      idx = -1,
      found = false;

    while (i < length && !found) {
      if (haystack[i] === needle) {
        idx = i;
        found = true;
      }

      i++;
    }

    return idx;
  };
};


var EventEmitter = function() {
  this.events = {};
};

EventEmitter.prototype.on = function(event, listener) {
  if (typeof this.events[event] !== 'object') {
    this.events[event] = [];
  }

  this.events[event].push(listener);
};

EventEmitter.prototype.removeListener = function(event, listener) {
  var idx;

  if (typeof this.events[event] === 'object') {
    idx = indexOf(this.events[event], listener);

    if (idx > -1) {
      this.events[event].splice(idx, 1);
    }
  }
};

EventEmitter.prototype.emit = function(event) {
  var i, listeners, length, args = [].slice.call(arguments, 1);

  if (typeof this.events[event] === 'object') {
    listeners = this.events[event].slice();
    length = listeners.length;

    for (i = 0; i < length; i++) {
      listeners[i].apply(this, args);
    }
  }
};

EventEmitter.prototype.once = function(event, listener) {
  this.on(event, function g() {
    this.removeListener(event, g);
    listener.apply(this, arguments);
  });
};

ftapi.ready();
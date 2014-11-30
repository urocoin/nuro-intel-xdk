var Bitcoin = {
    satoshiToCoinMultiplier: 100000000,
    minTxFee: 0.0001,
    dustThreshold: 0.00001
};

var Nuro = {
    coinKey: null, //CoinKey for the currently selected token type
    coinTicker: 'URO', //ticker symbol needs to match a token type in the "Supported" table here: http://cryptocoinjs.com/modules/currency/coininfo/ 
    accCat: "" //"Standard", the default account category - has username and empty suffix for compatibility reasons
};

var BlockCypherApi = {
    apiRootUrl: '',
    /*
     *add this to the end of all BlockCypher request URLs to assist with usage analysis
     */
    apiTokenSuffix: "?token=4e51fc637e97bcb0a0196",
    setChain: function (coinTicker) {
        this.apiRootUrl = "https://api.blockcypher.com/v1/" + coinTicker 
            + "/main/"; //mainnet
    },
    getNewTxUrl: function () {
        return this.apiRootUrl + "txs/new" + this.apiTokenSuffix;
    },
    getSendTxUrl: function () {
        return this.apiRootUrl + "txs/send" + this.apiTokenSuffix;
    },
    getBalAndTxsForAddrUrl: function (address) {
        return this.apiRootUrl + 'addrs/' + address + this.apiTokenSuffix;
    },
    getBalanceUrl: function (address) {
        return this.apiRootUrl + 'addrs/' + address + '/balance' + this.apiTokenSuffix; 
    }
};

/* Scans a barcode and stores the result in the input element with the specified ID */
function scanBarcodeInput(inputElementId) {
    document.addEventListener("intel.xdk.device.barcode.scan", function (evt) {
        if (evt.success == true) {
            //successful scan
            $('#' + inputElementId).val(evt.codedata);
        } else {
            //failed scan
            alert("Scan failed, please try again");
        }
    }, false);
    intel.xdk.device.scanBarcode();
}
function listProperties(obj) {
    var propList = "";
    for (var propName in obj) {
        if (typeof (obj[propName]) != "undefined") {
            propList += (propName + ", ");
        }
    }
    return propList;
}
function checkUserPass(showAlert) {
    if(typeof(showAlert)==='undefined') {
        showAlert = true;
    }
    var username = $('#uro-username-input').val().trim();
    if (username.length < 8) {
        if (showAlert) {
            alert('Username needs to be 8 characters or more');
        }
        return false;
    }
    var password = $('#uro-password-input').val().trim();
    if (password.length < 8) {
        if (showAlert) {
            alert('Password needs to be 8 characters or more');
        }
        return false;
    }
    var pin = $('#change-account-page-pin-code-input').val().trim();
    if (pin.length < 4) {
        if (showAlert) {
            alert('PIN needs to be 4 characters or more');
        }
        return false;
    }

    Nuro.pinCode = pin;
    password = password + pin + Nuro.accCat; //combine pin and account cat into password
    var coinutils = require('coinutils.js');
    Nuro.privateKey = coinutils.createBrainPrivateKey(username + Nuro.accCat.trim(), password);
    Nuro.coinKey = coinutils.createCoinKey(Nuro.privateKey, Nuro.coinTicker);
    BlockCypherApi.setChain(Nuro.coinTicker.toLowerCase());

    return true;
}
function clearPrivateData() {
    $('#uro-username-input').val('');
    $('#uro-password-input').val('');
    $('#change-account-page-pin-code-input').val('');
    Nuro.pinCode = null;
    Nuro.privateKey = null;
    Nuro.coinKey = null;
}
function switchSubPage(pageId) {
    if (checkUserPass()) {
        activate_subpage('#' + pageId);
    } else {
        activate_subpage('#change-account');
    }
}
function updateReceivePageContent() {
    $("#uro-receive-address-input").val(Nuro.coinKey.publicAddress);
    Nuro.qrcode.clear();
    Nuro.qrcode.makeCode(Nuro.coinKey.publicAddress);
}

/* Reset the send page to clean state */
function resetSendPageStatus() {
    $('#recipient-address-input').val('');
    $('#send-amount-input').val('');
    $('#send-status-label').html('Please scan/paste in valid receive address and enter the amount to send');
    $('#send-amount-input').val('');
    $('#send-page-pin-input').val('');
    updateSendPageContent();
}
function sendEmail() {
    var isHTML = false;
    var toString = "";
    var ccString = "";
    var bccString = "";
    intel.xdk.device.sendEmail("My " + Nuro.coinTicker + " receive address is: " 
                               + Nuro.coinKey.publicAddress + "\n\n Please send me:   " 
                               + Nuro.coinTicker, toString,
        Nuro.curCoinTicker + " Transaction Request", isHTML, ccString, bccString);
}
function sendSMS() {
    var toNumber = "";
    intel.xdk.device.sendSMS("My " + Nuro.coinTicker + " receive address is: " 
                             + Nuro.coinKey.publicAddress + "\n\n Please send me:   " 
                             + Nuro.coinTicker, toNumber);
}
function checkError(msg) {
    if (msg.errors && msg.errors.length) {
        log("Errors occured!!/n" + msg.errors.join("/n"));
        return true;
    }
}

// 1. Post our simple transaction information to get back the fully built transaction,
//    includes fees when required. amount should be in number of coins, e.g. 1.2, or 0.1
function createTx(srcAddr, destAddr, amount) {
    var newTx = {
        "inputs": [{
            "addresses": [srcAddr]
        }],
        "outputs": [{
            "addresses": [destAddr],
            "value": Math.round(amount * Bitcoin.satoshiToCoinMultiplier)
        }]
    };
    $('#send-status-label').html('Creating transaction for ' + amount);
    $.post(BlockCypherApi.getNewTxUrl(), JSON.stringify(newTx), function (data) {
        $('#send-status-label').html('Error occured during transaction processing');
        if (!checkError(data)) {
            if (data.tx.fees > 0) {
                var r = confirm("A transaction fee of " + data.tx.fees / Bitcoin.satoshiToCoinMultiplier 
                        + " will be deducted. Press OK to continue or Cancel to stop the transaction");
                if (r == true) {
                    //x = "You pressed OK!";
                } else {
                    //x = "You pressed Cancel!";
                    $('#send-status-label').html('Transaction cancelled by user due to fees.');
                    return;
                }
            }
            $('#send-status-label').html('Sending funds. Please wait...');
            signAndSendTx(data);
        } 
    });
}

// 2. Sign the hexadecimal strings returned with the fully built transaction and include
//    the source public address.
function signAndSendTx(newTx) {
    if (checkError(newTx)) return;
    var coinutils = require('coinutils.js');
    var publicKey = Nuro.coinKey.publicKey;
    var privateKey = Nuro.coinKey.privateKey;
    newTx.pubkeys = [];

    newTx.signatures = newTx.tosign.map(function (tosign) {
        newTx.pubkeys.push(coinutils.bufferToHex(publicKey));
        return coinutils.signMsg(tosign, privateKey);
    });
    console.log(JSON.stringify(newTx));
    $.post(BlockCypherApi.getSendTxUrl(), JSON.stringify(newTx), function (newTx) {
        if (!checkError(newTx)) {
            $('#send-status-label').html('Funds sent sucessfully.');
            alert('Funds sent. The recipent will be able to confirm receipt of the funds after a few seconds');
            resetSendPageStatus();
        } else {
            $('#send-status-label').html('Error occured during processing transaction');
        }
    });
}

/* Sends a transaction from data entered on the send page */
function sendTxFromPageData() {
    var destAddr = $('#recipient-address-input').val().trim();
    var amt = parseFloat($('#send-amount-input').val().trim());
    var pin = $('#send-page-pin-input').val().trim();
    var availableCoins = Nuro.fundsAvailable / Bitcoin.satoshiToCoinMultiplier;
    if (destAddr.length < 27 || destAddr.length > 34) {
        alert('Recipient address is invalid, please check it and try again');
        return false;
    }
    if (amt < Bitcoin.minTxFee) {
        alert('Amount must be greater than ' + Bitcoin.minTxFee 
              + ', please change the amount and try again');
        return false;
    }
    if (amt > availableCoins) {
        alert('Insufficient funds, please change the amount and try again');
        return false;
    }
    if (amt > availableCoins - Bitcoin.minTxFee) {
        alert('Insufficient funds after deducting transaction fee, please reduce the amount by ' 
              + Bitcoin.minTxFee + ' and try again');
        return false;
    }
    if (Nuro.pinCode != pin) {
        alert('PIN code is incorrect, please try again');
        return false;
    }
    //deduct the transaction fee if the balance is just enough to cover the transaction + fee
    if (availableCoins - amt < Bitcoin.dustThreshold) {
        amt = amt - Bitcoin.minTxFee;
        var r = confirm("The actual amount sent will be " + amt 
                        + " due to the transaction fee. Press OK to continue or Cancel to stop the transaction");
        if (r == true) {
            //x = "You pressed OK!";
        } else {
            //x = "You pressed Cancel!";
            return false;
        }
    }
    createTx(Nuro.coinKey.publicAddress, destAddr, amt);
}

/* It is assumed that sats is a valid JS integer */
function satoshiToCoinStr(sats) {
    sats = parseInt(sats);
    return "" + sats / Bitcoin.satoshiToCoinMultiplier + " " + Nuro.coinTicker;
}

function updateBalancePageContent() {
    Nuro.refreshButton.text('Loading Transactions...');
    Nuro.refreshButton.removeClass('refresh');
    Nuro.refreshButton.addClass('loading');

    $.get(BlockCypherApi.getBalAndTxsForAddrUrl(Nuro.coinKey.publicAddress), function (data) {
        
        var unconfirmedCoins = satoshiToCoinStr(data.unconfirmed_balance);
        var confirmedBalance = satoshiToCoinStr(data.balance);
        var balance = satoshiToCoinStr(data.balance + data.unconfirmed_balance);
        
        
        $("#acc-bal-lbl").html("Balance (Includes Pending): <b>" + balance + "</b>");
        $('#account-balance-page-pending-funds-p').html("Amounts Pending: <b>" 
                                            + unconfirmedCoins + "</b>");
        $('#account-balance-page-available-funds-p').html("Available Funds: <b>" 
                                            + getFundsAvailable(data) + "</b>");
        
        var txString = '';
        if ("txrefs" in data) {
            var txs = new Array();
            for (i = 0; i < data.txrefs.length; i++) {
                var txRef = data.txrefs[i]; 
                if (!(txRef.tx_hash in txs)) {
                    txs[txRef.tx_hash] = new Array();
                    txs[txRef.tx_hash]['amount'] = 0;
                }
                var amt = txRef.value;
                if (txRef.tx_output_n < 0) {
                    amt = -amt;
                }
                txs[txRef.tx_hash]['amount'] += amt;
                txs[txRef.tx_hash]['datetime'] = txRef.confirmed;
            }
            Nuro.lastTxRefs = data.txrefs;
            
            txString += '<ul class="list" align="left">';
            
            for (txHash in txs) {
                var dt = new Date(txs[txHash]['datetime']);
                txString += "<li>" + moment(dt).format("YYYY MMM Do, ha") + ": "; 
                txString += "<b>" + satoshiToCoinStr(txs[txHash]['amount']) + "</b></li>";
            }
            
            txString += "</ul>";
        }
        Nuro.accHistDiv.html(txString);
        Nuro.refreshButton.removeClass('loading');
        Nuro.refreshButton.addClass('refresh');
        Nuro.refreshButton.text(' Refresh');
    });
}

function getFundsAvailable(data) {
    var fundsAvailable = data.balance;
    if (data.unconfirmed_balance < 0) {
        fundsAvailable = data.balance + data.unconfirmed_balance;
    }
    Nuro.fundsAvailable = fundsAvailable;
    fundsAvailable = satoshiToCoinStr(fundsAvailable);
    return fundsAvailable;
}

function updateSendPageContent() {
    $.get(BlockCypherApi.getBalanceUrl(Nuro.coinKey.publicAddress), function (data) {
        $('#send-page-available-funds-p').html("<center>Available Funds: <b>" 
                                               + getFundsAvailable(data) + "</b></center>");
    });
}

function toggleSideMenuAndSwitchToInitPage() {
    $("footer > a").removeClass("pressed");
    if (checkUserPass(false)) {
        updateBalancePageContent();
        activate_subpage("#uro-balance-page");
        $("footer > a.info").addClass("pressed");
    } else {
        activate_subpage('#change-account');
    }
    $.ui.toggleSideMenu();
}

function switchAccountFromSideMenu(coinTicker) {
    Nuro.coinTicker = coinTicker;
    $("#sidemenu-btc-btn").children().removeClass("icon check");
    $("#sidemenu-ltc-btn").children().removeClass("icon check");
    $("#sidemenu-uro-btn").children().removeClass("icon check");
    toggleSideMenuAndSwitchToInitPage();
}

function register_event_handlers() {
    //qrcode object can only created after document.ready
    Nuro.qrcode = new QRCode("uro-receive-address-qrcode", {
        width: 192,
        height: 192
    });
    Nuro.refreshButton = $('#uro-balance-refresh');
    Nuro.accHistDiv = $("#acc-hist-div");
    
    $(document).on("click", "#sidemenu-uro-btn", function (evt) {
        switchAccountFromSideMenu("URO");
        $("#sidemenu-uro-btn").children().addClass("icon check");
    });
    
    $(document).on("click", "#sidemenu-btc-btn", function (evt) {
        switchAccountFromSideMenu("BTC");
        $("#sidemenu-btc-btn").children().addClass("icon check");
    });
    
    $(document).on("click", "#sidemenu-ltc-btn", function (evt) {
        switchAccountFromSideMenu("LTC");
        $("#sidemenu-ltc-btn").children().addClass("icon check");
    });
    
    $(document).on("click", ".acc-cat-radio-btns", function (evt) {
        Nuro.accCat = $(this).val();
        toggleSideMenuAndSwitchToInitPage();
    });

    $(document).on("click", "#change-address-page-login-button", function (evt) {
        if (!checkUserPass()) {
            return false;
        }

        updateBalancePageContent();
        activate_subpage("#uro-balance-page");
    });

    $(document).on("click", "#change-address-page-clear-all-button", function (evt) {
        $('#uro-username-input').val('');
        $('#uro-password-input').val('');
        $('#change-account-page-pin-code-input').val('');
    });

    $(document).on("click", "#send-page-select-from-address-book-button", function (evt) {
        //alert('send-page-select-from-address-book-button');
        //activate_subpage("#address-book-page"); 
    });

    $(document).on("click", "#uro-balance-refresh", function (evt) {
        updateBalancePageContent();
    });

    $(document).on("click", "#send-tx-button", function (evt) {
        sendTxFromPageData();
    });

    $(document).on("click", "#scan-recipent-address-button", function (evt) {
        scanBarcodeInput('recipient-address-input');
    });

    $(document).on("click", "#receive-page-send-sms-button", function (evt) {
        sendSMS();
    });

    $(document).on("click", "#receive-page-send-email-button", function (evt) {
        sendEmail();
    });
}
$(document).ready(register_event_handlers);
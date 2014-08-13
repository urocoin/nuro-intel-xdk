var Nuro = {}; 
Nuro.currentCoinTicker = 'URO';
Nuro.satoshiToCoinMultiplier = 100000000;

/**
* Scans a barcode and stores the result in the input element with the specified ID
*/
function scanBarcodeInput(inputElementId) {
    document.addEventListener("intel.xdk.device.barcode.scan",function(evt){
        intel.xdk.notification.beep(1);
        if (evt.success == true) {
            //successful scan
            $('#'+inputElementId).val(evt.codedata);
        } else {
            //failed scan
            alert("Scan failed, please try again");
        }
    }, false);
    intel.xdk.device.scanBarcode();
}

function listProperties(obj) {
   var propList = "";
   for(var propName in obj) {
      if(typeof(obj[propName]) != "undefined") {
         propList += (propName + ", ");
      }
   }
   return propList;
}

function checkUserPass(){
    var username = $('#uro-username-input').val().trim();
    if (username.length < 8) {
        alert('Username needs to be 8 characters or more');
        return false;
    }
    var password = $('#uro-password-input').val().trim();
    if (password.length < 8) {
        alert('Password needs to be 8 characters or more');
        return false;
    }    
    var pin = $('#change-account-page-pin-code-input').val().trim();
    if (pin.length < 4) {
        alert('PIN needs to be 4 characters or more');
        return false;
    }    
    
    Nuro.pinCode = pin;
    password = password + pin; //combine pin into password
    var coinutils = require('coinutils.js');
    Nuro.privateKey = coinutils.createBrainPrivateKey(username, password);
    Nuro.uroCoinKey = coinutils.createUroCoinKey(Nuro.privateKey);
    Nuro.ltcCoinKey = coinutils.createLtcCoinKey(Nuro.privateKey);
    Nuro.btcCoinKey = coinutils.createBtcCoinKey(Nuro.privateKey);

    return true;
}

function clearPrivateData() {
    $('#uro-username-input').val('');
    $('#uro-password-input').val('');
    $('#change-account-page-pin-code-input').val('');
    Nuro.pinCode = null;
    Nuro.privateKey = null;
    Nuro.uroCoinKey = null;
    Nuro.ltcCoinKey = null;
    Nuro.btcCoinKey = null;
}

function switchSubPage(pageId) {
    if (checkUserPass()) {
        activate_subpage('#' + pageId);
    } else {
        activate_subpage('#change-account');
    }
}

function updateReceivePageContent() {
    $("#uro-receive-address-lbl").text(Nuro.uroCoinKey.publicAddress);
    Nuro.qrcode.clear();
    Nuro.qrcode.makeCode(Nuro.uroCoinKey.publicAddress);
}

/*
Reset the send page to clean state
*/
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
    intel.xdk.device.sendEmail("My URO receive address is: " 
                               + Nuro.uroCoinKey.publicAddress 
                               + "\n\n Please send me:   URO", toString, 
                               "URO Transaction Request", isHTML, ccString, bccString);
}

function sendSMS() {
    var toNumber = "";
    intel.xdk.device.sendSMS("My URO receive address is: " 
                               + Nuro.uroCoinKey.publicAddress 
                               + "\n\n Please send me:   URO", toNumber);
}

function checkError(msg) {
    if (msg.errors && msg.errors.length) {
        log("Errors occured!!/n" + msg.errors.join("/n"));
        return true;
    }
}

// 1. Post our simple transaction information to get back the fully built transaction,
//    includes fees when required.
// amount should be in number of coins, e.g. 1.2, or 0.1
function createTx(srcAddr, destAddr, amount) {
    var rootUrl = "https://api.blockcypher.com/v1/uro/main";
    var newTx = {
        "inputs": [{"addresses": [srcAddr]}],
        "outputs": [{"addresses": [destAddr], "value": amount * Nuro.satoshiToCoinMultiplier}]
    };
    $.post(rootUrl+"/txs/new", JSON.stringify(newTx), function(newTx){
        if (!checkError(newTx)) {
            $('#send-status-label').html('Sending funds. Please wait...');
        } else {
            $('#send-status-label').html('Error occured during processing transaction');
        }
        signAndSendTx(newTx);
    });
}

// 2. Sign the hexadecimal strings returned with the fully built transaction and include
//    the source public address.
function signAndSendTx(newTx) {
    var rootUrl = "https://api.blockcypher.com/v1/uro/main";
    if (checkError(newTx)) return;
    var coinutils = require('coinutils.js');
    var publicKey = Nuro.uroCoinKey.publicKey;
    var privateKey = Nuro.uroCoinKey.privateKey;
    newTx.pubkeys = [];

    newTx.signatures = newTx.tosign.map(function(tosign) {
        newTx.pubkeys.push(coinutils.bufferToHex(publicKey));
        return coinutils.signMsg(tosign, privateKey);
    });
    console.log(JSON.stringify(newTx));
    $.post(rootUrl+"/txs/send", JSON.stringify(newTx), function(newTx){
        if (!checkError(newTx)) {
            $('#send-status-label').html('Funds sent sucessfully.');
            alert('Funds sent. The recipent will be able to confirm receipt of the funds after a few minutes');
            resetSendPageStatus();
        } else {
            $('#send-status-label').html('Error occured during processing transaction');
        }
    });
}

/*
Sends a transaction from data entered on the send page
*/
function sendTxFromPageData() {
    var destAddr = $('#recipient-address-input').val().trim();
    var amt = $('#send-amount-input').val().trim();
    var pin = $('#send-page-pin-input').val().trim();
    if (destAddr.length < 27 || destAddr.length > 34) {
        alert('Recipient address is invalid, please check it and try again');
        return false;
    }
    if (amt.length < 1 || amt < 0.01) {
        alert('Amount must be greater than 0.01, please check it and try again');
        return false;
    }
    if (amt > Nuro.fundsAvailable) {
        alert('Insufficient funds, please reduce and try again');
        return false;
    }
    if (Nuro.pinCode != pin) {
        alert('PIN code is incorrect, please try again');
        return false;
    }
    createTx(Nuro.uroCoinKey.publicAddress, destAddr, amt);
}

function satoshiToCoinStr(sats) {
    var coins = "";
    if (sats == 0) {
        coins = 0;
    } else {
        coins = sats / Nuro.satoshiToCoinMultiplier;
    }
    return coins + " " + Nuro.currentCoinTicker;
}

function updateBalancePageContent() {
    var balanceUrl = 'https://api.blockcypher.com/v1/uro/main/addrs/';
    var historyUrl = "http://cryptexplorer.com/address/";

    Nuro.refreshButton.text('Loading Transactions...');
    Nuro.refreshButton.removeClass('refresh');
    Nuro.refreshButton.addClass('loading');

    $.get(balanceUrl + Nuro.uroCoinKey.publicAddress + '/balance', function(data) {
        
        var unconfirmedCoins = satoshiToCoinStr(data.unconfirmed_balance);
        var confirmedBalance = satoshiToCoinStr(data.balance);
        var balance = satoshiToCoinStr(data.balance + data.unconfirmed_balance);
        var fundsAvailable = data.balance;
        if (data.unconfirmed_balance < 0) {
            fundsAvailable = data.balance + data.unconfirmed_balance;
        }
        fundsAvailable = satoshiToCoinStr(fundsAvailable);
        
        $("#acc-bal-lbl").html("Balance (Includes Pending): <b>" 
                               + balance + "</b>");
        $('#account-balance-page-pending-funds-p').html("Amounts Pending: <b>" 
                               + unconfirmedCoins + "</b>");
        $('#account-balance-page-available-funds-p').html("Available Funds: <b>" 
                               + fundsAvailable + "</b>");
    }); 

    Nuro.accHistDiv.children().remove();
    Nuro.accHistDiv.add('span').text('Loading past transactions...');

    $.get(historyUrl+Nuro.uroCoinKey.publicAddress, function(data) {
        Nuro.refreshButton.removeClass('loading');
        Nuro.refreshButton.addClass('refresh');
        Nuro.refreshButton.text(' Refresh');

        var tStart = data.indexOf('<table');
        var tEnd = data.indexOf('</table>') + 8;
        var tableHtml = data.substring(tStart, tEnd);

        Nuro.accHistDiv.html(tableHtml);
        Nuro.accHistDiv.children('table')[0].id = 'uro-acc-tx-table';
        Nuro.accHistDiv.children('table').addClass('sortable');
        sorttable.makeSortable(Nuro.accHistDiv.children('table')[0]);

        Nuro.txTable = Nuro.accHistDiv.children('table').children().children();
        for (i=0; i<Nuro.txTable.length; i++) {
            var row = Nuro.txTable[i];
            row.cells[4].remove(); //removes balance column
            row.cells[4].remove(); //removes currency column
            row.cells[1].remove(); //removes block column
            row.cells[0].remove(); //removes Tx ID column
        }
        
        setTimeout(function(){
            $('#uro-acc-tx-table').find('th').first().click(); //sort the table
            $('#uro-acc-tx-table').find('th').first().click(); //sort the table
            $('#uro-acc-tx-table').find('th').first().click(); //sort the table
        }, 1000);
    }); 
}

function updateSendPageContent() {
    var balanceUrl = 'https://api.blockcypher.com/v1/uro/main/addrs/';
    $.get(balanceUrl + Nuro.uroCoinKey.publicAddress + '/balance', function(data) {
        var fundsAvailable = data.balance;
        if (data.unconfirmed_balance < 0) {
            fundsAvailable = data.balance + data.unconfirmed_balance;
        }
        fundsAvailable = satoshiToCoinStr(fundsAvailable);
        Nuro.fundsAvailable = fundsAvailable;
        
        $('#send-page-available-funds-p').html("<center>Available Funds: <b>" 
                               + fundsAvailable + "</b></center>");
    }); 
}

function register_event_handlers() {
    //qrcode object can only created after document.ready
    Nuro.qrcode = new QRCode("uro-receive-address-qrcode", {width: 256, height: 256});
    Nuro.refreshButton = $('#uro-balance-refresh');
    Nuro.accHistDiv = $("#acc-hist-div");
    
    $(document).on("click", "#change-address-page-login-button", function(evt) {
        if (!checkUserPass()) {
            return false;
        }

        updateBalancePageContent();
        activate_subpage("#uro-balance-page"); 
    });
    
    $(document).on("click", "#change-address-page-clear-all-button", function(evt) {
        $('#uro-username-input').val('');
        $('#uro-password-input').val('');
        $('#change-account-page-pin-code-input').val('');
    });
    
    $(document).on("click", "#send-page-select-from-address-book-button", function(evt)     {
        //alert('send-page-select-from-address-book-button');
        //activate_subpage("#address-book-page"); 
    });
    
    $(document).on("click", "#uro-balance-refresh", function(evt) {
        updateBalancePageContent();
    });
    
    $(document).on("click", "#uro-balance-refresh", function(evt) {
        updateBalancePageContent();
    });

    $(document).on("click", "#send-tx-button", function(evt) {
        sendTxFromPageData();
    });
    
    $(document).on("click", "#scan-recipent-address-button", function(evt) {
        scanBarcodeInput('recipient-address-input');
    });
    
    $(document).on("click", "#receive-page-send-sms-button", function(evt) {
        sendSMS();
    });

    $(document).on("click", "#receive-page-send-email-button", function(evt) {
        sendEmail();
    });
    
    //remove 300ms delay in clicks
    window.addEventListener('load', function() {
        FastClick.attach(document.body);
    }, false);
}
$(document).ready(register_event_handlers);

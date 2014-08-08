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
            console.log(evt.codedata);
            $('#'+inputElementId).val(evt.codedata);

            if (evt.codedata == "http://www.sampleurl.com/fake.html")
            {
                    //in the XDK
            }
            else
            {
                    alert(evt.codedata);
            }
        } else {
            //failed scan
            console.log("failed scan");
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
    var username = $('#uro-username-input').val();
    if (username.length < 8) {
        alert('Username needs to be 8 characters or more');
        return false;
    }
    var password = $('#uro-password-input').val();
    if (username.length < 8) {
        alert('Password needs to be 10 characters or more');
        return false;
    }    
    Nuro.username = username;
    Nuro.password = password;
    var coinutils = require('coinutils.js');
    Nuro.privateKey = coinutils.createBrainPrivateKey(username, password);
    Nuro.uroCoinKey = coinutils.createUroCoinKey(Nuro.privateKey);
    Nuro.ltcCoinKey = coinutils.createLtcCoinKey(Nuro.privateKey);
    Nuro.btcCoinKey = coinutils.createBtcCoinKey(Nuro.privateKey);

    return true;
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
    var destAddr = $('#recipient-address-input').val();
    var amt = $('#send-amount-input').val();
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
        
        $("#acc-bal-lbl").html("Available balance: <b>" 
                               + satoshiToCoinStr(data.balance) + "</b>");
        $('#account-balance-page-pending-funds-p').html("Pending deposits: <b>" 
                               + satoshiToCoinStr(data.unconfirmed_balance) + "</b>");
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
    
    $(document).on("click", "#send-page-select-from-address-book-button", function(evt) {
        alert('send-page-select-from-address-book-button');
        activate_subpage("#address-book-page"); 
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
}
$(document).ready(register_event_handlers);

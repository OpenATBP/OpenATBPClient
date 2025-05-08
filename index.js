var app = require("app"); // Module to control application life.
var fs = require("fs-extra");
var os = require("os");
var dialog = require("dialog");
var BrowserWindow = require("browser-window");

var mainWindow = null;
var initialPageLoad = false;

app.commandLine.appendSwitch("--enable-npapi");

if (process.platform == "darwin") {
    var full_osx_version = require("child_process")
        .execSync("sw_vers -productVersion")
        .toString()
        .trim()
        .split(".");
    var osx_release =
        full_osx_version[0] == "10"
            ? Number(full_osx_version[1])
            : Number(full_osx_version[0]) + 5; // + 5 to cause Big Sur and up to follow Catalina as they should instead of overlapping El Capitan
    if (osx_release < 12) {
        app.commandLine.appendSwitch("--ignore-certificate-errors");
    }
}

var utilsdir = __dirname + "/../../utils";

// if running in non-packaged / development mode, this dir will be slightly different
if (process.env.npm_node_execpath) {
    utilsdir = __dirname + "/build/utils";
}

function verifyUnity() {
    if (os.platform() === "darwin") {
        return true;
    }
    var dllpath =
        app.getPath("appData") +
        "/../LocalLow/Unity/WebPlayer/player/3.x.x/webplayer_win.dll";

    if (fs.existsSync(dllpath)) {
        var buff = fs.readFileSync(dllpath);
        var hash = require("crypto")
            .createHash("md5")
            .update(buff)
            .digest("hex");
        if (hash == "33ffd00503b206260b0c273baf7e122e") {
            return true;
        }
    }
    return false;
}

function installUnity(callback) {
    if (os.platform() === "darwin") {
        callback();
        return;
    }

    // run the installer silently
    var child = require("child_process").spawn(
        utilsdir + "/UnityWebPlayer.exe",
        ["/quiet", "/S"]
    );
    child.on("exit", function () {
        console.log("Unity Web Player installed successfully.");
        callback();
    });
}

function initialSetup(firstTime) {
    // Display a small window to inform the user that the app is working
    setupWindow = new BrowserWindow({
        width: 275,
        height: 450,
        resizable: false,
        center: true,
        frame: false,
    });
    setupWindow.loadUrl("file://" + __dirname + "/initialsetup.html");
    installUnity(function () {
        if (firstTime) {
            // Copy default config
            fs.copySync(
                __dirname + "/defaults/config.json",
                app.getPath("userData") + "/config.json"
            );
        }
        setupWindow.destroy();
        showMainWindow();
    });
}

function zipCheck() {
    if (os.platform() === "darwin") {
        return false;
    }
    return app.getPath("exe").includes(os.tmpdir());
}

// Quit when all windows are closed.
app.on("window-all-closed", function () {
    if (process.platform != "darwin") app.quit();
});

app.on("ready", function () {
    // Check just in case the user forgot to extract the zip.
    if (zipCheck()) {
        errormsg =
            "It has been detected that OpenATBPClient is running from the TEMP folder.\n\n" +
            "Please extract the entire Client folder to a location of your choice before starting OpenATBPClient.";
        dialog.showErrorBox("Error!", errormsg);
        return;
    }

    var prefs = { 'plugins': true };

    if (os.platform() == "darwin") 
        prefs['extra-plugin-dirs'] = [utilsdir];

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1090,
        height: 776,
        show: false,
        "web-preferences": prefs,
    });
    mainWindow.setMinimumSize(640, 480);

    // Check for first run
    var configPath = app.getPath("userData") + "/config.json";
    try {
        if (!fs.existsSync(configPath)) {
            console.log("Config file not found. Running initial setup.");
            initialSetup(true);
        } else {
            if (verifyUnity()) {
                showMainWindow();
            } else {
                installUnity(showMainWindow);
            }
        }
    } catch (ex) {
        dialog.showErrorBox(
            "Error!",
            "An error occurred while checking for the config. Make sure you have sufficent permissions."
        );
        app.quit();
    }

    mainWindow.on("closed", function () {
        mainWindow = null;
    });
});

function showMainWindow() {
    var configPath = app.getPath("userData") + "/config.json";
    var config = fs.readJsonSync(configPath);

    console.log("Game URL:", config["game-url"]);
    mainWindow.loadUrl(config["game-url"]);

    // Reduces white flash when opening the program
    mainWindow.webContents.on("did-finish-load", function () {
        mainWindow.show();
        mainWindow.webContents.executeJavaScript("OnResize();");
        //mainWindow.webContents.openDevTools()
    });

    mainWindow.webContents.on("plugin-crashed", function () {
        dialog.showErrorBox(
            "Error!",
            "Unity Web Player has crashed. Please re-open the application."
        );
        mainWindow.destroy();
        app.quit();
    });

    mainWindow.webContents.on("will-navigate", function (evt, url) {
        evt.preventDefault();
        var configPath = app.getPath("userData") + "/config.json";
        var config = fs.readJsonSync(configPath);

        if (!url.startsWith(config["game-url"])) {
            require("shell").openExternal(url);
        } else {
            mainWindow.loadUrl(url);
            initialPageLoad = true;
        }
    });

    mainWindow.webContents.on("did-fail-load", function () {
        if (!initialPageLoad) {
            dialog.showErrorBox(
                "Error!",
                "Could not load page. Check your Internet connection, and game-url inside config.json."
            );
            mainWindow.destroy();
            app.quit();
        }
    });

    mainWindow.on('close',function(e){
      var choice = dialog.showMessageBox({"type":'question','buttons':['Yes','No'],'title':'Confirm','message':'Are you sure you want to close the client?'});
      if(choice == 1){
        e.preventDefault();
      }
    });
}

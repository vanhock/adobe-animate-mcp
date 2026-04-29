/* global CSInterface */

(function () {
  "use strict";

  var POLL_MS = 500;
  var HEARTBEAT_MS = 5000;
  /** Set true only if fl.runScript(fileUri, ...) still fails after the file:// fix (see README). */
  var LOAD_INLINE_JSFL = false;

  var EVAL_SCRIPT_ERR = "EvalScript error.";
  var TASK_REFRESH_MS = 600;
  var MAX_TASK_ROWS = 40;

  var bridgeInlineSourceCache = null;
  var bridgePlatformPathCache = null;
  var bridgeQueueRootPlatform = "";
  var lastExtendScriptError = "";

  function showBootError(msg) {
    var el = document.getElementById("boot-error");
    if (!el) return;
    el.className = "is-visible";
    el.textContent = msg;
  }

  function formatTime() {
    var t = new Date();
    function p(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds());
  }

  function pathJoin(dir, name) {
    var sep = String(dir || "").indexOf("\\") >= 0 ? "\\" : "/";
    return String(dir || "").replace(/[/\\]+$/, "") + sep + name;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function oneLine(s, max) {
    var u = String(s == null ? "" : s).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (u.indexOf("\n") >= 0) {
      u = u.split("\n")[0] + " …";
    }
    if (u.length > max) {
      return u.slice(0, max - 1) + "…";
    }
    return u;
  }

  function normalizeFsPayload(raw) {
    if (raw == null) return null;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw.err === 0 && typeof raw.data === "string") {
      return raw.data;
    }
    return null;
  }

  function cepReadFileText(platformPath) {
    try {
      if (!window.cep || !window.cep.fs || typeof window.cep.fs.readFile !== "function") {
        return null;
      }
      var raw = window.cep.fs.readFile(platformPath);
      var text = normalizeFsPayload(raw);
      return text && text.length ? text : null;
    } catch (e) {
      return null;
    }
  }

  function cepReadDirNames(platformPath) {
    try {
      if (!window.cep || !window.cep.fs || typeof window.cep.fs.readdir !== "function") {
        return null;
      }
      var raw = window.cep.fs.readdir(platformPath);
      if (!raw || typeof raw !== "object" || raw.err !== 0) {
        return null;
      }
      if (Array.isArray(raw.data)) {
        return raw.data;
      }
      if (typeof raw.data === "string") {
        return raw.data.split(/[\r\n]+/).filter(function (x) {
          return x.length > 0;
        });
      }
      return null;
    } catch (e2) {
      return null;
    }
  }

  function hasFile(names, fname) {
    for (var i = 0; i < names.length; i++) {
      if (names[i] === fname) {
        return true;
      }
    }
    return false;
  }

  function shortId(uuid) {
    if (!uuid || String(uuid).length < 10) {
      return uuid || "—";
    }
    var s = String(uuid);
    return "…" + s.slice(-8);
  }

  function relativeTime(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) {
      return "";
    }
    var sec = Math.round((Date.now() - t) / 1000);
    if (sec < 3) {
      return "now";
    }
    if (sec < 60) {
      return sec + "s";
    }
    if (sec < 3600) {
      return Math.round(sec / 60) + "m";
    }
    return Math.round(sec / 3600) + "h";
  }

  function renderTaskBoard() {
    var listEl = document.getElementById("task-list");
    var stripEl = document.getElementById("bridge-strip");
    if (!listEl || !bridgeQueueRootPlatform) {
      return;
    }

    var names = cepReadDirNames(bridgeQueueRootPlatform);
    if (!names) {
      listEl.innerHTML =
        '<div class="task-empty">Cannot read the bridge folder via CEP. JSFL polling still runs; full detail stays in ~/Documents/animate-mcp-bridge/.</div>';
      if (stripEl) {
        stripEl.innerHTML =
          '<div class="cepex">' +
          escapeHtml("Queue: " + oneLine(bridgeQueueRootPlatform, 200)) +
          "</div>";
      }
      return;
    }

    var cmdNames = names.filter(function (n) {
      return n.indexOf("command-") === 0 && n.lastIndexOf(".json") === n.length - 5;
    });

    var tasks = [];
    for (var i = 0; i < cmdNames.length; i++) {
      var text = cepReadFileText(pathJoin(bridgeQueueRootPlatform, cmdNames[i]));
      if (!text) {
        continue;
      }
      try {
        var env = JSON.parse(text);
        if (!env || !env.commandId || !env.command) {
          continue;
        }
        var rawSt = env.status || "pending";
        var stNorm =
          rawSt === "pending" ||
          rawSt === "running" ||
          rawSt === "completed" ||
          rawSt === "error"
            ? rawSt
            : "pending";
        var row = {
          commandId: env.commandId,
          command: env.command,
          status: stNorm,
          createdAt: env.createdAt || ""
        };
        if (row.status === "error" && hasFile(names, "result-" + row.commandId + ".json")) {
          var rt = cepReadFileText(pathJoin(bridgeQueueRootPlatform, "result-" + row.commandId + ".json"));
          if (rt) {
            try {
              var res = JSON.parse(rt);
              if (res && res.error && res.error.message) {
                row.detail = String(res.error.message);
              }
            } catch (eR) {}
          }
        }
        tasks.push(row);
      } catch (eJ) {}
    }

    tasks.sort(function (a, b) {
      var ta = Date.parse(a.createdAt || "") || 0;
      var tb = Date.parse(b.createdAt || "") || 0;
      return tb - ta;
    });
    tasks = tasks.slice(0, MAX_TASK_ROWS);

    if (tasks.length === 0) {
      listEl.innerHTML =
        '<div class="task-empty">No MCP commands in the queue yet. When your MCP client calls Animate tools, rows appear here: pending → running → completed (or error).</div>';
    } else {
      var html = "";
      for (var j = 0; j < tasks.length; j++) {
        var t = tasks[j];
        var st = t.status || "pending";
        var meta = shortId(t.commandId);
        var rel = relativeTime(t.createdAt);
        if (rel) {
          meta += " · " + rel;
        }
        var detail =
          t.detail && st === "error"
            ? '<div class="task-detail">' + escapeHtml(oneLine(t.detail, 200)) + "</div>"
            : "";
        html +=
          '<div class="task-row status-' +
          st +
          '">' +
          '<span class="task-cmd">' +
          escapeHtml(t.command) +
          "</span>" +
          '<span class="task-badge">' +
          escapeHtml(st) +
          "</span>" +
          '<span class="task-meta">' +
          escapeHtml(meta) +
          "</span>" +
          detail +
          "</div>";
      }
      listEl.innerHTML = html;
    }

    if (stripEl) {
      var mainLine = "Queue: ~/Documents/animate-mcp-bridge/";
      var stText = cepReadFileText(pathJoin(bridgeQueueRootPlatform, "state.json"));
      if (stText) {
        try {
          var st = JSON.parse(stText);
          var beat = st.lastHeartbeatISO ? relativeTime(st.lastHeartbeatISO) : "";
          var ver = st.animateVersion ? String(st.animateVersion) : "";
          mainLine = "JSFL";
          if (beat) {
            mainLine += " · heartbeat " + beat;
          }
          if (ver) {
            mainLine += " · " + ver;
          }
        } catch (eS) {
          mainLine = "Bridge folder readable";
        }
      } else {
        mainLine = "Waiting for state.json (first heartbeat from JSFL)";
      }
      var errBlock = lastExtendScriptError
        ? '<div class="cepex-err">' + escapeHtml(oneLine(lastExtendScriptError, 280)) + "</div>"
        : "";
      stripEl.innerHTML = '<div class="cepex">' + escapeHtml(mainLine) + "</div>" + errBlock;
    }
  }

  /**
   * JSFL fl.runScript expects a file URI (file:///...), not a bare platform path.
   * Encode each path segment (spaces, unicode) for a valid file URL.
   */
  function platformPathToFileUri(platformPath) {
    var p = String(platformPath || "").replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(p) || /^[A-Za-z]:$/.test(p)) {
      var driveLetter = p.charAt(0).toUpperCase();
      var rest = p.substring(2).replace(/^\/+/, "");
      var segs = rest.split("/").filter(function (x) {
        return x.length > 0;
      });
      var enc = segs.map(function (seg) {
        return encodeURIComponent(seg);
      });
      return "file:///" + driveLetter + ":/" + enc.join("/");
    }
    if (p.indexOf("/") === 0) {
      var parts = p.split("/").filter(function (x) {
        return x.length > 0;
      });
      var encU = parts.map(function (seg) {
        return encodeURIComponent(seg);
      });
      return "file:///" + encU.join("/");
    }
    return "file:///" + encodeURIComponent(p);
  }

  function bridgeJsflPlatformPath(extRoot) {
    var r = String(extRoot || "");
    var sep = r.indexOf("\\") >= 0 ? "\\" : "/";
    return r.replace(/[/\\]+$/, "") + sep + "host" + sep + "bridge.jsfl";
  }

  function panelContextJson(bridgeFileUri, extRoot, platformPath, bridgeQueueRootPlatformArg) {
    return JSON.stringify({
      bridgeJsflUri: bridgeFileUri,
      extensionRootPlatform: extRoot,
      bridgeJsflPlatformPath: platformPath,
      bridgeQueueRootPlatform: bridgeQueueRootPlatformArg
    });
  }

  function runJsflFunction(bridgeFileUri, fnName, panelCtxJson) {
    var third = panelCtxJson ? "," + JSON.stringify(panelCtxJson) : "";
    var cmd =
      "fl.runScript(" +
      JSON.stringify(bridgeFileUri) +
      "," +
      JSON.stringify(fnName) +
      third +
      ")";
    var cs = new CSInterface();
    cs.evalScript(cmd, function (res) {
      if (res && res !== "undefined" && res !== EVAL_SCRIPT_ERR) {
        lastExtendScriptError = "";
      }
      if (res === EVAL_SCRIPT_ERR) {
        lastExtendScriptError = "[" + formatTime() + "] " + fnName + ": " + EVAL_SCRIPT_ERR + " — see logs.txt";
      }
    });
  }

  function ensureInlineSource(platformPath, done) {
    if (bridgeInlineSourceCache) {
      done(null, bridgeInlineSourceCache);
      return;
    }
    bridgePlatformPathCache = platformPath;
    try {
      if (!window.cep || !window.cep.fs || typeof window.cep.fs.readFile !== "function") {
        done(new Error("cep.fs.readFile not available; use file:// fl.runScript path."));
        return;
      }
      var data = cepReadFileText(platformPath);
      if (!data || !data.length) {
        done(new Error("readFile returned empty"));
        return;
      }
      bridgeInlineSourceCache = data;
      done(null, data);
    } catch (eRead) {
      done(eRead instanceof Error ? eRead : new Error(String(eRead)));
    }
  }

  function runJsflInline(fnName, panelCtxJson, onDone) {
    var platformPath = bridgePlatformPathCache;
    if (!platformPath) {
      if (onDone) onDone(new Error("No platform path for inline mode"));
      return;
    }
    ensureInlineSource(platformPath, function (err, src) {
      if (err || !src) {
        if (onDone) onDone(err);
        return;
      }
      var tail;
      if (panelCtxJson && fnName === "heartbeat") {
        tail = "\nheartbeat(" + JSON.stringify(panelCtxJson) + ");";
      } else if (panelCtxJson && fnName === "pollOnePendingCommand") {
        tail = "\npollOnePendingCommand(" + JSON.stringify(panelCtxJson) + ");";
      } else {
        tail = "\n" + fnName + "();";
      }
      var bundle = src + tail;
      var cs = new CSInterface();
      cs.evalScript(bundle, function (res) {
        if (res && res !== "undefined" && res !== EVAL_SCRIPT_ERR) {
          lastExtendScriptError = "";
        }
        if (res === EVAL_SCRIPT_ERR) {
          lastExtendScriptError = "[" + formatTime() + "] inline-" + fnName + ": " + EVAL_SCRIPT_ERR;
        }
        if (onDone) onDone(null);
      });
    });
  }

  function dispatchJsfl(bridgeFileUri, platformPath, fnName, panelCtxJson) {
    if (LOAD_INLINE_JSFL) {
      runJsflInline(fnName, panelCtxJson === undefined ? null : panelCtxJson, null);
    } else {
      runJsflFunction(bridgeFileUri, fnName, panelCtxJson);
    }
  }

  function startBridge() {
    try {
      startBridgeCore();
    } catch (outer) {
      showBootError("startBridge: " + (outer && outer.message ? outer.message : String(outer)));
    }
  }

  function startBridgeCore() {
    var SysPath =
      typeof window !== "undefined" && window.SystemPath ? window.SystemPath : null;
    if (!SysPath || !SysPath.EXTENSION) {
      showBootError(
        'CEP globals missing (SystemPath). Is CSInterface.js loaded before main.js?\nRestart Animate after reinstalling the extension.'
      );
      return;
    }

    var cs = new CSInterface();
    var extRoot;
    try {
      extRoot = cs.getSystemPath(SysPath.EXTENSION);
    } catch (e1) {
      showBootError("getSystemPath(extension) failed: " + (e1 && e1.message ? e1.message : String(e1)));
      return;
    }

    var bridgePlatform = bridgeJsflPlatformPath(extRoot);
    var bridgeUri = platformPathToFileUri(bridgePlatform);
    var docsPath = cs.getSystemPath(SysPath.MY_DOCUMENTS);
    var docsStr = String(docsPath || "");
    var pathSep = docsStr.indexOf("\\") >= 0 ? "\\" : "/";
    bridgeQueueRootPlatform = docsStr.replace(/[/\\]+$/, "") + pathSep + "animate-mcp-bridge";
    var ctxJson = panelContextJson(bridgeUri, extRoot, bridgePlatform, bridgeQueueRootPlatform);
    bridgePlatformPathCache = bridgePlatform;

    renderTaskBoard();
    setInterval(renderTaskBoard, TASK_REFRESH_MS);

    setInterval(function () {
      dispatchJsfl(bridgeUri, bridgePlatform, "pollOnePendingCommand", ctxJson);
    }, POLL_MS);

    setInterval(function () {
      dispatchJsfl(bridgeUri, bridgePlatform, "heartbeat", ctxJson);
    }, HEARTBEAT_MS);

    dispatchJsfl(bridgeUri, bridgePlatform, "heartbeat", ctxJson);
  }

  window.onerror = function (_msg, url, line, col, err) {
    var detail = err && err.message ? err.message : String(_msg);
    showBootError("Panel JS error at " + (url || "?") + ":" + line + " — " + detail);
    return false;
  };

  setTimeout(startBridge, 0);
})();

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
//#region Implementation
function normalizeText(input) {
    const map = {
        "\u2014": "-", // em dash
        "\u2013": "-", // en dash
        "\u201C": '"', // left double quote
        "\u201D": '"', // right double quote
        "\u201E": '"', // low double quote
        "\u201F": '"', // high-reversed double quote
        "\u2018": "'", // left single quote
        "\u2019": "'", // right single quote
        "\u2026": "...", // ellipsis
        "\u200B": "", // zero-width space
        "\u00A0": " ", // non-breaking space
        "\uFEFF": "" // BOM
    };
    let out = input;
    // Optional but recommended: Unicode compatibility normalization
    out = out.normalize("NFKC");
    // 1) Apply explicit Unicode → ASCII replacements
    for (const [unicodeChar, replacement] of Object.entries(map)) {
        out = out.split(unicodeChar).join(replacement);
    }
    // 2) Replace any remaining disallowed characters
    const disallowedChar = /[^A-Za-z0-9   ,\."'()\[\];:/?><!@#$%^&*+=\-\\\r\n]/g;
    out = out.replace(disallowedChar, "?");
    return out;
}
async function normalize() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return;
    await editor.edit((editBuilder) => {
        for (const sel of editor.selections) {
            const text = editor.document.getText(sel);
            if (!text)
                continue;
            const normalizedText = normalizeText(text);
            editBuilder.replace(sel, normalizedText);
        }
    });
}
//#endregion Implementation
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('text-utils.normalize', normalize);
    context.subscriptions.push(disposable);
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map
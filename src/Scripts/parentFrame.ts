﻿import * as $ from "jquery";
import { fabric } from "./fabric";
import { Diagnostics } from "./diag";
import { Errors } from "./Errors";
import { GetHeaders } from "./GetHeaders";
import { poster } from "./poster";
import { strings } from "./Strings";

class Choice {
    label: string;
    url: string;
    checked: boolean;
}

export class ParentFrame {
    private static iFrame = null;
    private static currentChoice = {} as Choice;
    private static deferredErrors = [];
    private static deferredStatus = [];
    private static headers = "";
    private static modelToString = "";

    private static choices: Array<Choice> = [
        { label: "classic", url: "classicDesktopFrame.html", checked: false },
        { label: "new", url: "newDesktopFrame.html", checked: true },
        { label: "new-mobile", url: "newMobilePaneIosFrame.html", checked: false }
    ];

    private static getQueryVariable(variable) {
        const vars = window.location.search.substring(1).split("&");
        for (let i = 0; i < vars.length; i++) {
            const pair = vars[i].split("=");
            if (pair[0] === variable) {
                return pair[1];
            }
        }
        return null;
    }

    private static setDefault() {
        let uiDefault = ParentFrame.getQueryVariable("default");
        if (uiDefault === null) {
            uiDefault = "new";
        }

        for (let iChoice = 0; iChoice < ParentFrame.choices.length; iChoice++) {
            if (uiDefault === ParentFrame.choices[iChoice].label) {
                ParentFrame.choices[iChoice].checked = true;
            } else {
                ParentFrame.choices[iChoice].checked = false;
            }
        }
    }

    private static postMessageToFrame(eventName: string, data) {
        poster.postMessageToFrame(ParentFrame.iFrame, eventName, data);
    }

    private static render() {
        if (ParentFrame.headers) Diagnostics.trackEvent({ name: "analyzeHeaders" });
        ParentFrame.postMessageToFrame("renderItem", ParentFrame.headers);
    }

    private static setFrame(frame) {
        ParentFrame.iFrame = frame;

        if (ParentFrame.iFrame) {
            // If we have any deferred status, signal them
            for (let iStatus = 0; iStatus < ParentFrame.deferredStatus.length; iStatus++) {
                ParentFrame.postMessageToFrame("updateStatus", ParentFrame.deferredStatus[iStatus]);
            }

            // Clear out the now displayed status
            ParentFrame.deferredStatus = [];

            // If we have any deferred errors, signal them
            for (let iError = 0; iError < ParentFrame.deferredErrors.length; iError++) {
                ParentFrame.postMessageToFrame("showError",
                    {
                        error: JSON.stringify(ParentFrame.deferredErrors[iError][0]),
                        message: ParentFrame.deferredErrors[iError][1]
                    });
            }

            // Clear out the now displayed errors
            ParentFrame.deferredErrors = [];

            ParentFrame.render();
        }
    }

    private static eventListener(event) {
        if (!event || event.origin !== poster.site()) return;

        if (event.data) {
            switch (event.data.eventName) {
                case "frameActive":
                    ParentFrame.setFrame(event.source);
                    break;
                case "LogError":
                    Errors.log(JSON.parse(event.data.data.error), event.data.data.message);
                    break;
                case "modelToString":
                    ParentFrame.modelToString = event.data.data;
                    break;
            }
        }
    }

    private static loadNewItem() {
        if (Office.context.mailbox.item) {
            GetHeaders.send(function (_headers, apiUsed) {
                ParentFrame.headers = _headers;
                Diagnostics.set("API used", apiUsed);
                ParentFrame.render();
            });
        }
    }

    private static registerItemChangedEvent() {
        try {
            if (Office.context.mailbox.addHandlerAsync !== undefined) {
                Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged,
                    function () {
                        Errors.clear();
                        Diagnostics.clear();
                        ParentFrame.loadNewItem();
                    });
            }
        } catch (e) {
            Errors.log(e, "Could not register item changed event");
        }
    }

    // Tells the UI to show an error.
    public static showError(error, message: string, suppressTracking?: boolean) {
        Errors.log(error, message, suppressTracking);

        if (ParentFrame.iFrame) {
            ParentFrame.postMessageToFrame("showError", { error: JSON.stringify(error), message: message });
        } else {
            // We don't have an iFrame, so defer the message
            ParentFrame.deferredErrors.push([error, message]);
        }
    }

    // Tells the UI to show an error.
    public static updateStatus(statusText) {
        if (ParentFrame.iFrame) {
            ParentFrame.postMessageToFrame("updateStatus", statusText);
        } else {
            // We don't have an iFrame, so defer the status
            ParentFrame.deferredStatus.push(statusText);
        }
    }

    private static getSettingsKey() {
        try {
            return "frame" + Office.context.mailbox.diagnostics.hostName;
        } catch (e) {
            return "frame";
        }
    }

    // Display primary UI
    private static go(choice: Choice) {
        ParentFrame.iFrame = null;
        ParentFrame.currentChoice = choice;
        (document.getElementById("uiFrame") as HTMLIFrameElement).src = choice.url;
        if (Office.context) {
            Office.context.roamingSettings.set(ParentFrame.getSettingsKey(), choice);
            Office.context.roamingSettings.saveAsync();
        }
    }

    private static goDefaultChoice() {
        for (let iChoice = 0; iChoice < ParentFrame.choices.length; iChoice++) {
            const choice = ParentFrame.choices[iChoice];
            if (choice.checked) {
                ParentFrame.go(choice);
                return;
            }
        }
    }

    private static create(parentElement, newType, newClass) {
        const newElement = $(document.createElement(newType));
        if (newClass) {
            newElement.addClass(newClass);
        }

        if (parentElement) {
            parentElement.append(newElement);
        }

        return newElement;
    }

    // Create list of choices to display for the UI types
    private static addChoices() {
        const list = $("#uiChoice-list");
        list.empty();

        for (let iChoice = 0; iChoice < ParentFrame.choices.length; iChoice++) {
            const choice = ParentFrame.choices[iChoice];

            // Create html: <li class="ms-RadioButton">
            const listItem = ParentFrame.create(list, "li", "ms-RadioButton");

            // Create html: <input tabindex="-1" type="radio" class="ms-RadioButton-input" value="classic">
            const input = ParentFrame.create(listItem, "input", "ms-RadioButton-input");

            input.attr("tabindex", "-1");
            input.attr("type", "radio");
            input.attr("value", iChoice);

            //  Create html: <label role="radio" class="ms-RadioButton-field" tabindex="0" aria-checked="false" name="uiChoice">
            const label = ParentFrame.create(listItem, "label", "ms-RadioButton-field");
            label.attr("role", "radio");
            label.attr("tabindex", "0");
            label.attr("name", "uiChoice");
            label.attr("value", choice.label);

            // Create html: <span class="ms-Label">classic</span>
            const inputSpan = ParentFrame.create(label, "span", "ms-Label");
            inputSpan.text(choice.label);
        }
    }

    // Hook the UI together for display
    private static initFabric() {
        let i;
        const header = document.querySelector(".header-row");

        const dialogSettings = header.querySelector("#dialog-Settings");
        // Wire up the dialog
        const dialogSettingsComponent = new fabric["Dialog"](dialogSettings);

        const dialogDiagnostics = header.querySelector("#dialog-Diagnostics");
        // Wire up the dialog
        const dialogDiagnosticsComponent = new fabric["Dialog"](dialogDiagnostics);

        const actionButtonElements = header.querySelectorAll(".ms-Dialog-action");

        const telemetryCheckbox = document.querySelector("#dialog-enableTelemetry");
        const telemetryCheckboxComponent = new fabric["CheckBox"](telemetryCheckbox);
        Diagnostics.canSendTelemetry() ? telemetryCheckboxComponent.check() : telemetryCheckboxComponent.unCheck();

        function actionHandler() {
            const action = this.id;

            function getDiagnostics() {
                let diagnostics = "";
                try {
                    const diagnosticMap = Diagnostics.get();
                    for (const diag in diagnosticMap) {
                        if (diagnosticMap.hasOwnProperty(diag)) {
                            diagnostics += diag + " = " + diagnosticMap[diag] + "\n";
                        }
                    }
                } catch (e) {
                    diagnostics += "ERROR: Failed to get diagnostics\n";
                }

                const errors = Errors.get();
                for (let iError = 0; iError < errors.length; iError++) {
                    if (errors[iError]) {
                        diagnostics += "ERROR: " + errors[iError] + "\n";
                    }
                }

                return diagnostics;
            }

            Diagnostics.setSendTelemetry(telemetryCheckboxComponent.getValue());

            switch (action) {
                case "actionsSettings-OK": {
                    // How did the user say to display it (UI to display)
                    const iChoice = ($("#uiChoice input:checked")[0] as HTMLInputElement).value;
                    const choice: Choice = ParentFrame.choices[iChoice];
                    if (choice.label !== ParentFrame.currentChoice.label) {
                        ParentFrame.go(choice);
                    }

                    break;
                }
                case "actionsSettings-diag": {
                    const diagnostics = getDiagnostics();
                    $("#diagnostics").text(diagnostics);
                    dialogDiagnosticsComponent.open();
                    break;
                }
            }
        }

        // Wire up the buttons
        for (i = 0; i < actionButtonElements.length; i++) {
            new fabric["Button"](actionButtonElements[i], actionHandler);
        }

        const choiceGroup = dialogSettings.querySelectorAll(".ms-ChoiceFieldGroup");
        new fabric["ChoiceFieldGroup"](choiceGroup[0]);

        const choiceFieldGroupElements = dialogSettings.querySelectorAll(".ms-ChoiceFieldGroup");
        for (i = 0; i < choiceFieldGroupElements.length; i++) {
            new fabric["ChoiceFieldGroup"](choiceFieldGroupElements[i]);
        }

        const settingsButton = header.querySelector(".gear-button") as HTMLButtonElement;
        // When clicking the button, open the dialog
        settingsButton.onclick = function () {
            // Set the current choice in the UI.
            $("#uiChoice input").attr("checked", "false");
            const labels = $("#uiChoice label");
            labels.removeClass("is-checked");
            labels.attr("aria-checked", "false");
            const currentSelected = $("#uiChoice label[value=" + ParentFrame.currentChoice.label + "]");
            currentSelected.addClass("is-checked");
            currentSelected.attr("aria-checked", "true");
            const input = currentSelected.prevAll("input:first");
            input.prop("checked", "true");
            dialogSettingsComponent.open();
        };

        const copyButton = header.querySelector(".copy-button") as HTMLButtonElement;
        copyButton.onclick = function () {
            strings.copyToClipboard(ParentFrame.modelToString);
        };
    }

    public static initUI() {
        ParentFrame.setDefault();
        ParentFrame.addChoices();
        ParentFrame.initFabric();

        try {
            const choice: Choice = Office.context.roamingSettings.get(ParentFrame.getSettingsKey());
            Diagnostics.setSendTelemetry(Office.context.roamingSettings.get("sendTelemetry"));

            const input = $("#uiToggle" + choice.label);
            input.prop("checked", "true");
            ParentFrame.go(choice);
        } catch (e) {
            ParentFrame.goDefaultChoice();
        }

        ParentFrame.registerItemChangedEvent();

        window.addEventListener("message", ParentFrame.eventListener, false);
        ParentFrame.loadNewItem();
    }

    public static get choice(): Choice { return ParentFrame.currentChoice; }
}
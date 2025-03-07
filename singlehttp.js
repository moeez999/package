const PubNub = require("pubnub");

const pubnub = new PubNub({
  publishKey: "pub-c-6eff84b7-2a87-4fc4-b179-b6a446cfd56a",
  subscribeKey: "sub-c-f1f7d84f-4054-4ad0-b021-ee4be410f80f",
  userId: "user-1",
});

function nextSteps(cellId, YN) {
  let direction = YN;
  const rowLabel = cellId.slice(0, 1);
  let newRowValue = parseInt(cellId.slice(1, cellId.indexOf("c")));
  const colLabel = cellId.slice(cellId.indexOf("c"), cellId.indexOf("c") + 1);
  let newColValue = parseInt(cellId.slice(cellId.indexOf("c") + 1));
  switch (direction) {
    case "N":
      newRowValue -= 1;
      break;
    case "E":
      newColValue += 1;
      break;
    case "S":
      newRowValue += 1;
      break;
    case "W":
      newColValue -= 1;
      break;
    case "0":
      newColValue += 1;
      break;
    default:
      showWarning("Direction unknown - " + cellId);
      return;
  }
  const nextCell = `${rowLabel}${newRowValue}${colLabel}${newColValue}`;
  return nextCell;
}

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const port = 5000;
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

app.post("/start-lambda", async (req, res) => {
  try {
    const { process, data } = req.body;
    const { channelId } = req.query;
    const { processmodal } = req.query;

    if (processmodal === "true") {
      console.log("Received Channel Id", channelId);
      res.status(200).send(channelId);
      tempChannelId = channelId;
      tempProcess = process;
      sendLargeData(req.body, channelId);
    } else if (processmodal === "false") {
      console.log("Received Channel Id second", channelId);
      const tileID = data.output.tileID;
      if (tileID && tempProcess && tempChannelId) {
        res.status(200).send("TileID processed successfully");
        const currentStep = tempProcess.sequence[tileID];
        const nextStepId = nextSteps(tileID, currentStep.out);

        const message = {
          processInfoName: tempProcess.info.name,
          BPMN: tempProcess.sequence[tileID].BPMN,
          task: tempProcess.sequence[tileID].task,
          nextStep: nextStepId,
          previousStep: tileID,
          lambda: true,
        };
        await sendPubnubMessage(channelId, message);
        let messageData = {
          channel: channelId, // Fixed channelId issue
        };
        if (currentStep.breakpoint === "true") {
          console.log("breakpoint 2", currentStep.breakpoint);
          const now = new Date();
          const dateTimeString = now
            .toLocaleString("en-GB", { timeZone: "UTC" })
            .replace(",", "");

          let breakpointMessage = {
            dateTimeString: dateTimeString,
            processInfoName: "",
            BPMN: "",
            task: "Break Point",
            nextStep: "-",
            previousStep: "-",
            joinArray: [],
            stepArray: [],
          };
          let breakpointMessageTwo = {
            dateTimeString: "",
            processInfoName: "",
            BPMN: "",
            task: "Break Point is True",
            nextStep: "-",
            previousStep: "-",
            joinArray: [],
            stepArray: [],
          };
          if (channelId) {
            await sendPubnubMessage(channelId, breakpointMessage);
            await sendPubnubMessage(channelId, breakpointMessageTwo);
          }

          return "Flow Break";
        } else {
          console.log("breakpoint 1", currentStep.breakpoint);
          const now = new Date();
          const dateTimeString = now
            .toLocaleString("en-GB", { timeZone: "UTC" })
            .replace(",", "");

          let messagetosend = {
            dateTimeString: "",
            processInfoName: tempProcess.info?.name,
            BPMN: "Run process",
            task: "Automation Started",
            nextStep: "-",
            previousStep: "-",
            joinArray: [],
            stepArray: [nextStepId],
          };

          console.log("messagetosend", messagetosend);

          if (channelId) {
            await sendPubnubMessage(channelId, messagetosend);
          }

          let breakpointMessage = {
            dateTimeString: dateTimeString,
            processInfoName: "",
            BPMN: "",
            task: "Break Point",
            nextStep: "-",
            previousStep: "-",
            joinArray: [],
            stepArray: [],
          };
          let breakpointMessageTwo = {
            dateTimeString: dateTimeString,
            processInfoName: "",
            BPMN: "",
            task: "Flow Break Breakpoint is False",
            nextStep: "-",
            previousStep: "-",
            joinArray: [],
            stepArray: [],
          };

          console.log("breakpointMessage", breakpointMessage);

          if (channelId) {
            await sendPubnubMessage(channelId, breakpointMessage);
            await sendPubnubMessage(channelId, breakpointMessageTwo);
          }

          console.log(
            "Breakpoint is false, sending message to Lambda:",
            messageData
          );
          console.log("channel id before msg send", channelId);

          const response = fetch(
            "https://l4de4qu2susik7odbq3kq6fe3i0soapi.lambda-url.us-east-1.on.aws/",
            {
              method: "POST",
              body: JSON.stringify(messageData),
              headers: { "Content-Type": "application/json" },
            }
          );

          console.log("Message sent:", response);

          if (channelId) {
            await sendPubnubMessage(channelId, message);
          }
        }
      } else {
        res.status(400).send("Invalid tileID or missing process/channelId");
      }
    } else {
      res.status(400).send("Invalid request");
    }
  } catch (error) {
    console.error("Error in Lambda function:", error);
    res.status(500).send("Error in Lambda function");
  }
});

function sendLargeData(data, channel) {
  const maxChunkSize = 5 * 1024; // Set the maximum chunk size (e.g., 30KB)
  const jsonStr = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += maxChunkSize) {
    const chunk = jsonStr.slice(i, i + maxChunkSize);
    chunks.push(chunk);
  }
  chunks.forEach(async (chunk, index) => {
    const message = {
      chunkIndex: index,
      totalChunks: chunks.length,
      data: chunk,
    };
    await sendPubnubMessage(channel, message);
  });
}

function sendPubnubMessage(channel, message) {
  console.log("Sending message:", message);
  pubnub.publish(
    {
      channel: channel,
      message: message,
    },
    (status, response) => {
      if (status.error) {
        console.error("Channel creation error:", status.errorData);
      } else {
        console.log("Message Sent:", message);
      }
    }
  );
}
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

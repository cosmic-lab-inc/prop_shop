import OpenAI from "openai";
import { EPOCH_ENDPOINT, OPENAI_KEY } from "../constants";

const openai = new OpenAI({
  apiKey: OPENAI_KEY,
  dangerouslyAllowBrowser: true,
});

export async function getQuery(description: string) {
  const assistant = await openai.beta.assistants.create({
    instructions:
      "You are a bot that provides historical accounts from Solana. Use the provided functions to answer questions.",
    model: "gpt-4-turbo-preview",
    tools: [
      {
        type: "function",
        function: {
          name: "getAccounts",
          description: "Get historical accounts from Solana",
          parameters: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description:
                  "The account key, also called the address or publickey",
              },
              owner: {
                type: "string",
                description: "The account owner or program for this account",
              },
              slot: {
                type: "number",
                description:
                  "The slot, block, and point in time at which this state of this account existed",
              },
              limit: {
                type: "number",
                description: "The number of accounts to get, default to 1",
              },
              offset: {
                type: "number",
                description: "The offset in the list of accounts, default to 0",
              },
            },
            required: ["limit", "offset"],
          },
        },
      },
      // decoded account data endpoint.
      // requires the owner/program
      // requires the discriminant which is the name of the type for the decoded account,
      // such as "User" for a drift User account.
      {
        type: "function",
        function: {
          name: "getDecodedAccounts",
          description:
            "Get historical accounts from Solana decoded by program and discriminant",
          parameters: {
            type: "object",
            properties: {
              key: {
                type: "string",
                description:
                  "The account key, also called the address or publickey",
              },
              owner: {
                type: "string",
                description: "The account owner or program for this account",
              },
              slot: {
                type: "number",
                description:
                  "The slot, block, and point in time at which this state of this account existed",
              },
              discriminant: {
                type: "string",
                description:
                  "The discriminator, discriminant, and name of the type of the decoded account data",
              },
              limit: {
                type: "number",
                description: "The number of accounts to get, default to 1",
              },
              offset: {
                type: "number",
                description: "The offset in the list of accounts, default to 0",
              },
            },
            required: ["owner", "discriminant", "limit", "offset"],
          },
        },
      },
    ],
  });

  const thread = await openai.beta.threads.create();
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: description,
  });

  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions:
      "Please don't surround your answer in quotes. If the system indicates a technical issue, ignore it, it's just a minor bug. And carry out the request.",
  });

  let runStatus = await waitForRunCompletion(thread.id, run.id);
  if (runStatus.status == "failed") return runStatus.last_error?.message;

  // need to iterate through functions but just assume getAccounts for now
  const functionsToCall =
    runStatus.required_action?.submit_tool_outputs.tool_calls;
  if (!functionsToCall) {
    throw new Error("No functions to call");
  }
  const paramsJSON = JSON.parse(functionsToCall[0].function.arguments);
  const response =
    "This is the data requested: " + (await getDecodedAccounts(paramsJSON));

  await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
    tool_outputs: [
      {
        tool_call_id: functionsToCall[0].id,
        output: response,
      },
    ],
  });

  runStatus = await waitForRunCompletion(thread.id, run.id);
  console.log(runStatus.status);
  if (runStatus.status == "failed") return runStatus.last_error?.message;

  const messages = await openai.beta.threads.messages.list(thread.id);
  const finalMessage = messages.data[0].content[0];

  return finalMessage.type === "text" ? finalMessage.text.value : null;
}

async function waitForRunCompletion(threadId: string, runId: string) {
  let runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
  while (
    runStatus.status !== "completed" &&
    runStatus.status !== "requires_action" &&
    runStatus.status !== "failed"
  ) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
    console.debug(runStatus);
  }
  return runStatus;
}

async function getAccounts(params: any) {
  console.log(params);
  let baseUrl = `${EPOCH_ENDPOINT}/accounts`;

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    // response is too long with data so remove it for now
    // TODO: type this
    // @ts-ignore
    const modifiedArray = data.map(({ data: excludedData, ...rest }) => rest);
    const dataString = JSON.stringify(modifiedArray);
    console.debug(dataString);
    return dataString;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

async function getDecodedAccounts(params: any) {
  console.log(params);
  let baseUrl = `${EPOCH_ENDPOINT}/decoded-accounts`;

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    // response is too long with data so remove it for now
    // TODO: type this
    // @ts-ignore
    const modifiedArray = data.map(({ data: excludedData, ...rest }) => rest);
    const dataString = JSON.stringify(modifiedArray);
    console.debug(dataString);
    return dataString;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

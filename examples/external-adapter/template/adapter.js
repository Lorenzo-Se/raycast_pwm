#!/usr/bin/env node

const MOCK_ENTRIES = [
  {
    id: "mock-github",
    title: "GitHub",
    subtitle: "Personal",
    username: "devuser",
    email: "dev@example.com",
    password: "mock-github-password",
    totp: "123456",
    url: "https://github.com",
  },
  {
    id: "mock-netflix",
    title: "Netflix",
    subtitle: "Family",
    username: "family",
    email: "family@example.com",
    password: "mock-netflix-password",
    url: "https://netflix.com",
  },
  {
    id: "mock-aws",
    title: "AWS Console",
    subtitle: "Work",
    username: "admin",
    email: "admin@company.com",
    password: "mock-aws-password",
    totp: "654321",
    url: "https://console.aws.amazon.com",
  },
];

function readRequest() {
  return new Promise((resolve, reject) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(input));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

function sendSuccess(result) {
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
}

function sendError(message) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { message } })}\n`);
}

function findEntry(item) {
  return MOCK_ENTRIES.find((entry) => entry.id === item.id);
}

function toVaultItem(entry) {
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    username: entry.username,
    email: entry.email,
    url: entry.url,
    hasTotp: Boolean(entry.totp),
    managerId: "template-external",
  };
}

function filterItems(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  const items = MOCK_ENTRIES.map(toVaultItem);

  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    [item.title, item.subtitle, item.username, item.email]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(normalized)),
  );
}

async function handleRequest(request) {
  if (request.protocolVersion !== 1) {
    throw new Error(`Unsupported protocol version: ${request.protocolVersion}`);
  }

  switch (request.method) {
    case "isAvailable":
      return { status: { ok: true } };

    case "listItems":
      return { items: MOCK_ENTRIES.map(toVaultItem) };

    case "searchItems":
      return { items: filterItems(request.params?.query) };

    case "getPassword": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }
      return { value: entry.password };
    }

    case "getUsername": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }
      return { value: entry.username };
    }

    case "getEmail": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }
      return { value: entry.email };
    }

    case "getTotp": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }
      return { value: entry.totp };
    }

    case "getUrl": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }
      return { value: entry.url };
    }

    case "getItemAvailability": {
      const entry = findEntry(request.params?.item);
      if (!entry) {
        throw new Error(`Item not found: ${request.params?.item?.id}`);
      }

      return {
        hasUrl: Boolean(entry.url),
        url: entry.url,
        hasEmail: Boolean(entry.email),
        hasUsername: Boolean(entry.username),
        hasTotp: Boolean(entry.totp),
        hasPassword: Boolean(entry.password),
      };
    }

    case "openInManager":
      return {};

    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

async function main() {
  try {
    const request = await readRequest();
    const result = await handleRequest(request);
    sendSuccess(result);
  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();

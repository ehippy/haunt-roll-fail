import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface User {
  id: string;
  name: string;
  secret: string;
}

export interface Journal {
  id: string;
  name: string;
  public: boolean;
  status: string;
  message: string;
}

export interface Entry {
  journalId: string;
  index: number;
  userId: string;
  text: string;
}

export interface Play {
  secret: string;
  journalId: string;
  userId: string;
}

export async function getUser(id: string): Promise<User | undefined> {
  const r = await client.send(new GetCommand({ TableName: Resource.Users.name, Key: { id } }));
  return r.Item as User | undefined;
}

export async function putUser(user: User): Promise<void> {
  await client.send(new PutCommand({ TableName: Resource.Users.name, Item: user }));
}

export async function putJournal(journal: Journal): Promise<void> {
  await client.send(new PutCommand({ TableName: Resource.Journals.name, Item: journal }));
}

// AccessRights mirrors the (journalId, userId, right) rows from GoodGame.scala
// as a single item per (journalId, userId) with a `rights` string set.
export async function getAccessRights(journalId: string, userId: string): Promise<Set<string>> {
  const r = await client.send(
    new GetCommand({ TableName: Resource.AccessRights.name, Key: { journalId, userId } }),
  );
  return new Set<string>((r.Item?.rights as string[]) ?? []);
}

export async function hasRight(
  userId: string,
  userSecret: string,
  journalId: string,
  right: string,
): Promise<boolean> {
  const user = await getUser(userId);
  if (!user || user.secret !== userSecret) return false;
  const rights = await getAccessRights(journalId, userId);
  return rights.has(right);
}

export async function addAccessRights(
  journalId: string,
  userId: string,
  rights: string[],
): Promise<void> {
  const existing = await getAccessRights(journalId, userId);
  rights.forEach((r) => existing.add(r));
  await client.send(
    new PutCommand({
      TableName: Resource.AccessRights.name,
      Item: { journalId, userId, rights: Array.from(existing) },
    }),
  );
}

export async function putPlay(play: Play): Promise<void> {
  await client.send(new PutCommand({ TableName: Resource.Plays.name, Item: play }));
}

export async function getPlay(secret: string): Promise<Play | undefined> {
  const r = await client.send(new GetCommand({ TableName: Resource.Plays.name, Key: { secret } }));
  return r.Item as Play | undefined;
}

export async function readEntries(journalId: string, from: number): Promise<Entry[]> {
  const items: Entry[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const r = await client.send(
      new QueryCommand({
        TableName: Resource.Entries.name,
        KeyConditionExpression: "journalId = :j AND #i >= :f",
        ExpressionAttributeNames: { "#i": "index" },
        ExpressionAttributeValues: { ":j": journalId, ":f": from },
        ExclusiveStartKey,
      }),
    );
    items.push(...((r.Items as Entry[]) ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items.sort((a, b) => a.index - b.index);
}

// Mirrors `entries ++= 0.until(ss.size).map(n => Entry(journalId, from + n, ...))`
// wrapped in a single Slick transaction: all rows are written atomically, and
// the whole batch is rejected (mapped to the client's 409 path) if any index
// in the range is already taken.
export async function appendEntries(
  journalId: string,
  from: number,
  userId: string,
  texts: string[],
): Promise<boolean> {
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: texts.map((text, n) => ({
          Put: {
            TableName: Resource.Entries.name,
            Item: { journalId, index: from + n, userId, text },
            ConditionExpression: "attribute_not_exists(#i)",
            ExpressionAttributeNames: { "#i": "index" },
          },
        })),
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof Error && e.name === "TransactionCanceledException") return false;
    throw e;
  }
}

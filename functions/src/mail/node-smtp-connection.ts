import { createConnection, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import type { SmtpConnectionFactory, SmtpWireConnection } from "./smtp-session.js";

type ActiveSocket = Socket | TLSSocket;

type ReplyWaiter = { resolve: (value: string) => void; reject: (error: Error) => void };

/** Reference Node transport for dedicated long-lived mail workers, not Cloud Functions. */
export class NodeSmtpWireConnection implements SmtpWireConnection {
  private socket: ActiveSocket;
  private input = "";
  private replyLines: string[] = [];
  private replyCode: string | undefined;
  private readonly replies: string[] = [];
  private readonly waiters: ReplyWaiter[] = [];
  private terminalError: Error | undefined;

  private readonly onData = (chunk: Buffer) => {
    this.input += chunk.toString("utf8");
    this.drainLines();
  };
  private readonly onError = (error: Error) => this.fail(error);
  private readonly onClose = () => {
    if (!this.terminalError) this.fail(new Error("SMTP connection closed."));
  };

  constructor(socket: Socket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: ActiveSocket) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  private detach(socket: ActiveSocket) {
    socket.off("data", this.onData);
    socket.off("error", this.onError);
    socket.off("close", this.onClose);
  }

  private drainLines() {
    for (;;) {
      const end = this.input.indexOf("\r\n");
      if (end < 0) return;
      const line = this.input.slice(0, end);
      this.input = this.input.slice(end + 2);
      const status = line.match(/^(\d{3})([- ])/);
      if (!status) {
        this.fail(new Error("SMTP peer emitted a malformed reply line."));
        return;
      }
      const code = status[1]!;
      const separator = status[2]!;
      if (!this.replyCode) this.replyCode = code;
      if (code !== this.replyCode) {
        this.fail(new Error("SMTP multiline reply changed status code."));
        return;
      }
      this.replyLines.push(line);
      if (separator === " ") {
        const reply = this.replyLines.join("\r\n");
        this.replyLines = [];
        this.replyCode = undefined;
        this.publish(reply);
      }
    }
  }

  private publish(reply: string) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(reply);
    else this.replies.push(reply);
  }

  private fail(error: Error) {
    if (this.terminalError) return;
    this.terminalError = error;
    while (this.waiters.length) this.waiters.shift()!.reject(error);
  }

  async readResponse() {
    const reply = this.replies.shift();
    if (reply) return reply;
    if (this.terminalError) throw this.terminalError;
    return new Promise<string>((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async writeLine(line: string) {
    if (/\r|\n/.test(line)) throw new Error("SMTP command cannot contain CR/LF.");
    await this.write(Buffer.from(`${line}\r\n`, "utf8"));
  }

  async writeData(data: Uint8Array) {
    await this.write(Buffer.from(data));
  }

  private async write(data: Uint8Array) {
    if (this.terminalError) throw this.terminalError;
    await new Promise<void>((resolve, reject) => {
      this.socket.write(data, (error?: Error | null) => error ? reject(error) : resolve());
    });
  }

  async startTls(serverName: string) {
    if (this.input.length || this.replyLines.length) throw new Error("Cannot STARTTLS with a partial SMTP reply buffered.");
    const plain = this.socket;
    this.detach(plain);
    const secure = connectTls({ socket: plain as Socket, servername: serverName, rejectUnauthorized: true });
    this.socket = secure;
    this.attach(secure);
    await new Promise<void>((resolve, reject) => {
      const onSecure = () => { cleanup(); resolve(); };
      const onFailure = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => {
        secure.off("secureConnect", onSecure);
        secure.off("error", onFailure);
      };
      secure.once("secureConnect", onSecure);
      secure.once("error", onFailure);
    });
    const cipher = secure.getCipher();
    return {
      ...(secure.getProtocol() ? { version: secure.getProtocol()! } : {}),
      ...(cipher?.name ? { cipher: cipher.name } : {}),
      peerName: serverName,
    };
  }

  close() {
    this.socket.end();
    this.socket.destroy();
  }
}

export class NodeSmtpConnectionFactory implements SmtpConnectionFactory {
  async connect(input: { host: string; address: string; port: 25; timeoutMs: number; sourceIp?: string }) {
    const socket = createConnection({ host: input.address, port: input.port, ...(input.sourceIp ? { localAddress: input.sourceIp } : {}) });
    const connection = new NodeSmtpWireConnection(socket);
    socket.setTimeout(input.timeoutMs);
    await new Promise<void>((resolve, reject) => {
      const onConnect = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const onTimeout = () => { cleanup(); socket.destroy(); reject(new Error(`SMTP connect timeout to ${input.host}.`)); };
      const cleanup = () => {
        socket.off("connect", onConnect);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      socket.once("connect", onConnect);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
    });
    socket.setTimeout(0);
    return connection;
  }
}

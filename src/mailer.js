import net from 'node:net';
import tls from 'node:tls';

import { AppError } from './errors.js';

function createLineReader(socket) {
  let buffer = '';
  const queue = [];
  const waiters = [];

  function flush() {
    while (true) {
      const index = buffer.indexOf('\r\n');
      if (index < 0) {
        break;
      }
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (waiters.length) {
        waiters.shift()(line);
      } else {
        queue.push(line);
      }
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    flush();
  });

  return async function readLine() {
    if (queue.length) {
      return queue.shift();
    }
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  };
}

async function readResponse(readLine) {
  const lines = [];
  let code = '';

  while (true) {
    const line = await readLine();
    if (!line) {
      throw new Error('SMTP connection closed unexpectedly');
    }
    lines.push(line);
    code = line.slice(0, 3);
    if (line[3] !== '-') {
      return {
        code: Number.parseInt(code, 10),
        lines,
        message: lines.map((item) => item.slice(4)).join('\n'),
      };
    }
  }
}

async function expectResponse(readLine, expectedCodes) {
  const response = await readResponse(readLine);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP error ${response.code}: ${response.message}`);
  }
  return response;
}

function writeLine(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\r\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function encodeSmtpUtf8(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrapBase64(value, width = 76) {
  return value.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\r\n') || value;
}

function formatAddress(email, name) {
  if (!name) {
    return email;
  }
  return `${encodeSmtpUtf8(name)} <${email}>`;
}

function buildCodeEmail({ from, to, replyTo, code, expiresInSeconds, purpose, messageIdDomain }) {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  const subject =
    purpose === 'activation'
      ? 'Astral Forge account verification code'
      : 'Astral Forge login verification code';
  const headline =
    purpose === 'activation'
      ? 'Use the verification code below to activate your account.'
      : 'Use the verification code below to complete sign in.';
  const actionLabel = purpose === 'activation' ? 'Verification code' : 'Login code';
  const textBody = [
    'Astral Forge',
    '',
    headline,
    '',
    `${actionLabel}: ${code}`,
    `Expires in: ${minutes} minute(s)`,
    '',
    'If this was not your request, you can ignore this email.',
  ].join('\r\n');
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@${messageIdDomain}>`,
    'Content-Type: text/plain; charset=us-ascii',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
  ].filter(Boolean);

  return headers.join('\r\n');
}

async function upgradeToTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect(
      {
        socket,
        servername: host,
      },
      () => resolve(secureSocket),
    );
    secureSocket.once('error', reject);
  });
}

async function connectSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    const socket = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.once('error', onError);
  });
}

async function sendSmtpMessage(smtpConfig, message) {
  let socket = await connectSocket(smtpConfig);
  socket.setTimeout(30000);
  socket.on('timeout', () => {
    socket.destroy(new Error('SMTP connection timed out'));
  });

  let readLine = createLineReader(socket);

  try {
    await expectResponse(readLine, [220]);

    const ehlo = async () => {
      await writeLine(socket, `EHLO ${smtpConfig.clientName}`);
      return expectResponse(readLine, [250]);
    };

    let response = await ehlo();
    const advertised = response.lines.map((line) => line.slice(4).trim().toUpperCase());

    if (!smtpConfig.secure && advertised.some((line) => line.startsWith('STARTTLS'))) {
      await writeLine(socket, 'STARTTLS');
      await expectResponse(readLine, [220]);
      socket = await upgradeToTls(socket, smtpConfig.host);
      socket.setTimeout(30000);
      socket.on('timeout', () => {
        socket.destroy(new Error('SMTP connection timed out'));
      });
      readLine = createLineReader(socket);
      response = await ehlo();
    }

    const capabilities = response.lines.map((line) => line.slice(4).trim().toUpperCase());
    const authLine = capabilities.find((line) => line.startsWith('AUTH ')) || '';
    const authMethods = authLine.split(/\s+/).slice(1);

    if (smtpConfig.username) {
      if (authMethods.includes('PLAIN')) {
        const payload = Buffer.from(`\u0000${smtpConfig.username}\u0000${smtpConfig.password}`, 'utf8').toString('base64');
        await writeLine(socket, `AUTH PLAIN ${payload}`);
        await expectResponse(readLine, [235]);
      } else if (authMethods.includes('LOGIN')) {
        await writeLine(socket, 'AUTH LOGIN');
        await expectResponse(readLine, [334]);
        await writeLine(socket, Buffer.from(smtpConfig.username, 'utf8').toString('base64'));
        await expectResponse(readLine, [334]);
        await writeLine(socket, Buffer.from(smtpConfig.password, 'utf8').toString('base64'));
        await expectResponse(readLine, [235]);
      } else {
        throw new Error('SMTP server does not advertise AUTH PLAIN/LOGIN');
      }
    }

    await writeLine(socket, `MAIL FROM:<${smtpConfig.fromEmail}>`);
    await expectResponse(readLine, [250]);
    await writeLine(socket, `RCPT TO:<${smtpConfig.toEmail}>`);
    await expectResponse(readLine, [250, 251]);
    await writeLine(socket, 'DATA');
    await expectResponse(readLine, [354]);
    await writeLine(socket, `${message}\r\n.`);
    await expectResponse(readLine, [250]);
    await writeLine(socket, 'QUIT');
    await expectResponse(readLine, [221]);
  } finally {
    if (!socket.destroyed) {
      socket.end();
    }
  }
}

export function createMailer({ config, logger }) {
  return {
    async sendAuthCodeEmail({ toEmail, code, expiresInSeconds, purpose = 'login' }) {
      if (config.auth.emailDeliveryMode !== 'smtp') {
        return { mode: config.auth.emailDeliveryMode };
      }

      try {
        const message = buildCodeEmail({
          from: formatAddress(config.auth.smtp.fromEmail, config.auth.smtp.fromName),
          to: toEmail,
          replyTo: config.auth.smtp.replyTo,
          code,
          expiresInSeconds,
          purpose,
          messageIdDomain: config.auth.smtp.fromEmail.split('@')[1] || 'localhost',
        });

        await sendSmtpMessage(
          {
            host: config.auth.smtp.host,
            port: config.auth.smtp.port,
            secure: config.auth.smtp.secure,
            username: config.auth.smtp.username,
            password: config.auth.smtp.password,
            fromEmail: config.auth.smtp.fromEmail,
            toEmail,
            clientName: 'localhost',
          },
          message,
        );

        logger?.info('auth.email_sent', {
          email: toEmail,
          mode: 'smtp',
          purpose,
        });
        return { mode: 'smtp' };
      } catch (error) {
        logger?.error('auth.email_send_failed', {
          email: toEmail,
          mode: 'smtp',
          purpose,
          message: error.message,
        });
        throw new AppError(502, 'Failed to send verification email', {
          cause: error.message,
        });
      }
    },
  };
}

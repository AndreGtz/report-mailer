/* eslint-env node */
/* eslint no-console: ["error", { allow: ["info","error"] }] */

const moment = require('moment-timezone');
const request = require('request-promise');
const pug = require('pug');
const pdf = require('html-pdf');
const nodemailer = require('nodemailer');
const {
  account,
  serverurl,
  geocodingKey,
} = require('./secrets');


const getMailsControl = (usuarios) => {
  let emails = [];
  if (usuarios.success && usuarios.data && usuarios.data.length) {
    usuarios.data.forEach((usuario) => {
      if (usuario.isControl) {
        const _emails = usuario.emails ? usuario.emails.split(/,| /) : [];
        emails = emails.concat(_emails);
      }
    });
  }
  return emails;
};

const generateCheckin = async () => {
  const datetime = moment().tz('America/Mexico_City').subtract(1, 'days');
  const yesterday = datetime.format('YYYY-MM-DD');
  const user = process.env.USER;
  const password = process.env.PASSWORD;

  const auth = await request.post({
    method: 'POST',
    uri: `${serverurl}/api/v1/auth`,
    json: true,
    body: {
      user,
      password,
    },
  }).catch(e => console.error(e));

  const checkin = await request.post({
    method: 'POST',
    uri: `${serverurl}/api/v1/checkin`,
    json: true,
    body: {
      fecha: yesterday,
    },
    headers: {
      Authorization: auth.token,
    },
  }).catch(e => console.error(e));

  if (checkin.registros && checkin.registros.length) {
    const usuarios = await request.get({
      method: 'GET',
      uri: `${serverurl}/usuario`,
      json: true,
      headers: {
        Authorization: auth.token,
      },
    }).catch(e => console.error(e));
    const data = {
      date: yesterday,
      registros: checkin.registros,
      dateFormat(date) {
        return moment(date).tz('America/Mexico_City').format('HH:mm:ss');
      },
    };
    const html = pug.renderFile('./report-template/report-checkin.pug', data);
    pdf.create(html, {
      renderDelay: 1000,
      height: 1068,
      width: 640,
      quality: '100',
    })
      // .toFile(`./prueba-${usuario.idUsuario}.pdf`, (err, res) => {
      //   if (err) return console.error(err);
      //   return console.info(res);
      // });
      .toBuffer((err, buffer) => {
        if (err) {
          console.error(err);
          return;
        }
        // create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport({
          host: 'smtp.mailtrap.io',
          port: 2525,
          // secure: true, // true for 465, false for other ports
          auth: {
            user: account.user, // generated ethereal user
            pass: account.pass, // generated ethereal password
          },
        });
        // setup email data with unicode symbols
        const emails = getMailsControl(usuarios);
        const mailOptions = {
          from: '"No responder" <reportes@caebes.com>', // sender address
          to: emails, // list of receivers
          subject: 'Reporte del día', // Subject line
          text: 'Adjunto el reporte del día', // plain text body
          html: '<b>Adjunto el reporte del día</b>', // html body
          attachments: [
            { // binary buffer as an attachment
              filename: 'reporte.pdf',
              content: buffer,
              contentType: 'application/pdf',
            },
          ],
        };
        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(error);
            return false;
          }
          console.info('Message sent: %s', info.messageId);
          return true;
        });
      });
  }
};

const msleep = millis => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millis);

const updateEmergencias = async (emergencias) => {
  for (let i = 0; i < emergencias.length; i++) {
    const url = `https://api.opencagedata.com/geocode/v1/json?key=${geocodingKey}&q=${emergencias[i].latitud},${emergencias[i].longitud}&no_annotations=1`;
    const response = await request(url).catch(e => console.error(e));
    const resObj = JSON.parse(response);
    if (resObj.results && resObj.results.length) {
      emergencias[i].address = decodeURI(resObj.results[0].formatted);
    }
    msleep(1100);
  }
  return emergencias;
};

const generateAlertsSOS = async () => {
  const datetime = moment().tz('America/Mexico_City').subtract(1, 'days');
  const yesterday = datetime.format('YYYY-MM-DD');
  const user = process.env.USER;
  const password = process.env.PASSWORD;

  const auth = await request.post({
    method: 'POST',
    uri: `${serverurl}/api/v1/auth`,
    json: true,
    body: {
      user,
      password,
    },
  }).catch(e => console.error(e));

  const usuariosRes = await request.get({
    method: 'GET',
    uri: `${serverurl}/policia`,
    json: true,
    headers: {
      Authorization: auth.token,
    },
  }).catch(e => console.error(e));
  const policias = [];
  const usuarios = usuariosRes.data;
  for (let i = 0; i < usuarios.length; i++) {
    const emergencias = await request.get({
      method: 'GET',
      uri: `${serverurl}/emergencia?policia=${usuarios[i].id}&startDate=${yesterday}&endDate=${yesterday}`,
      json: true,
      headers: {
        Authorization: auth.token,
      },
    }).catch(e => console.error(e));
    emergencias.data = await updateEmergencias(emergencias.data);
    if (emergencias.data && emergencias.data.length) {
      usuarios[i].emergencias = emergencias.data;
      policias.push(usuarios[i]);
    }
  }

  if (policias.length) {
    const usuariosControler = await request.get({
      method: 'GET',
      uri: `${serverurl}/usuario`,
      json: true,
      headers: {
        Authorization: auth.token,
      },
    }).catch(e => console.error(e));
    const data = {
      date: yesterday,
      registros: policias,
      dateFormat(date) {
        return moment(date).tz('America/Mexico_City').format('HH:mm:ss');
      },
    };
    const html = pug.renderFile('./report-template/report-emergencias.pug', data);
    pdf.create(html, {
      renderDelay: 1000,
      height: 1068,
      width: 640,
      quality: '100',
    })
      // .toFile(`./prueba-${usuario.idUsuario}.pdf`, (err, res) => {
      //   if (err) return console.error(err);
      //   return console.info(res);
      // });
      .toBuffer((err, buffer) => {
        if (err) {
          console.error(err);
          return;
        }
        // create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport({
          host: 'smtp.mailtrap.io',
          port: 2525,
          // secure: true, // true for 465, false for other ports
          auth: {
            user: account.user, // generated ethereal user
            pass: account.pass, // generated ethereal password
          },
        });
        // setup email data with unicode symbols
        const emails = getMailsControl(usuariosControler);
        const mailOptions = {
          from: '"No responder" <reportes@caebes.com>', // sender address
          to: emails, // list of receivers
          subject: 'Reporte de Emergencias del día', // Subject line
          text: 'Adjunto el reporte del día', // plain text body
          html: '<b>Adjunto el reporte del día</b>', // html body
          attachments: [
            { // binary buffer as an attachment
              filename: 'reporte-emergencias.pdf',
              content: buffer,
              contentType: 'application/pdf',
            },
          ],
        };
        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error(error);
            return false;
          }
          console.info('Message sent: %s', info.messageId);
          return true;
        });
      });
  }
};

generateCheckin();
generateAlertsSOS();

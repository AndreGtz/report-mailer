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
  let yesterday = datetime.format('YYYY-MM-DD');
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

  yesterday = '2019-03-08'; // Comment it
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

generateCheckin();

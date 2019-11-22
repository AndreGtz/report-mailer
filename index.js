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

const getMails = (mailString) => {
  const split = mailString.split(/\s|,\s*/g);
  return split.join(', ');
};

const generate = async () => {
  const datetime = moment().tz('America/Mexico_City').subtract(1, 'days');
  const users = await request.post({
    method: 'POST',
    uri: `${serverurl}/usuarios/byReport`,
    body: {
      reportFrecuency: 2, // mensual
    },
    json: true,
  }).catch(e => console.error(e));

  users.forEach(async (usuario) => {
    const data = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/reportes/resumen/mensual',
      body: {
        usuario: usuario.idUsuario,
        fecha: datetime.format('YYYY-MM-DD'),
      },
      json: true,
    }).catch(e => console.error(e));

    if (data.units && data.units.length) {
      const hasVehicles = data.units.find(unit => unit.unit.gpsModel !== 'qbit');

      if (hasVehicles) {
        const fuelPrices = await request(`http://localhost:7000/combustibles/last/${usuario.estado}/${usuario.municipio}/`)
          .catch(error => console.error(error));
        data.fuelPrices = JSON.parse(fuelPrices);
      }
    }
    const html = pug.renderFile('./report-template/report.pug', data);
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
          host: 'smtp.mailgun.org',
          port: 587,
          auth: {
            user: account.user, // generated ethereal user
            pass: account.pass, // generated ethereal password
          },
        });
        // setup email data with unicode symbols
        const mailOptions = {
          from: '"No responder" <reportes@caebes.com>', // sender address
          to: getMails(usuario.correo), // list of receivers
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
  });
};

generate();

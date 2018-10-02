const moment = require('moment-timezone');
const request = require('request-promise');
const pug = require('pug');
const pdf = require('html-pdf');
const nodemailer = require('nodemailer');
const { account, geocodingKey } = require('./secrets');
const users = require('./secrets').usuarios;

const msleep = millis => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millis);

const generate = async () => {
  const datetime = moment().tz('America/Mexico_City').subtract(1, 'days');
  users.forEach(async (user) => {
    const usuario = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/usuarios/byReport',
      body: {
        usuario: user,
      },
      json: true,
    }).catch(e => console.error(e));
    const data = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/reportes/resumen',
      body: {
        usuario: usuario.idUsuario,
        fecha: datetime.format('YYYY-MM-DD'),
      },
      json: true,
    }).catch(e => console.error(e));

    for (let unitIndex = 0; unitIndex < data.units.length; unitIndex += 1) {
      for (let stopIndex = 0; stopIndex < data.units[unitIndex].stops.length; stopIndex += 1) {
        const stop = data.units[unitIndex].stops[stopIndex];
        const response = await request(`https://api.opencagedata.com/geocode/v1/json?key=${geocodingKey}&q=${stop.latitud}%2C${stop.longitud}&no_annotations=1`)
          .catch(e => console.error(e));
        const resObj = JSON.parse(response);
        if (resObj.results) {
          data
            .units[unitIndex]
            .stops[stopIndex]
            .address = decodeURI(resObj.results[0].formatted);
        }
        msleep(1100);
      }
    }
    const html = pug.renderFile('./report-template/report.pug', data);
    pdf.create(html, {
      renderDelay: 1000,
      height: 1068,
      width: 640,
      quality: '100',
    })
      // .toFile('./prueba.pdf', (err, res) => {
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
          host: 'smtp.zoho.com',
          port: 465,
          secure: true, // true for 465, false for other ports
          auth: {
            user: account.user, // generated ethereal user
            pass: account.pass, // generated ethereal password
          },
        });
        // setup email data with unicode symbols
        const mailOptions = {
          from: '"No responder" <reportes@caebes.com>', // sender address
          to: usuario.correo, // list of receivers
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

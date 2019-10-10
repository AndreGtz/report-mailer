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
  usuarios,
} = require('./secrets');

const getMails = (mailString) => {
  const split = mailString.split(/\s|,\s*/g);
  return split.join(', ');
};

const generate = async () => {
  usuarios.forEach(async (usuario) => {
    const unidades = await request({
      method: 'GET',
      uri: `${serverurl}/unidades/usuarios/${usuario}`,
      json: true,
    })
      .catch(err => console.error(err));

    const combustible = await request({
      method: 'GET',
      uri: `${serverurl}/combustibles/last/16/53`,
      json: true,
    })
      .catch(err => console.error(err));

    const units = await unidades.map(async (unidad) => {
      const distancias = await request({
        uri: `${serverurl}/distancias/unidad/${unidad.idUnidad}`,
        method: 'GET',
        json: true,
      })
        .catch(err => console.error(err));
      const distancia = distancias.map(d => parseInt(d.distancia, 10)).reduce((acc, next) => acc + next, 0);
      const gas = Math.round(distancia / unidad.combustible * 100) / 100;
      return {
        idUnidad: unidad.idUnidad,
        unit: unidad.unidad,
        distance: distancia,
        gpsModel: unidad.gpsModel,
        gas,
        fuelType: unidad.tipoCombustible,
      };
    });

    const datetimeI = moment().tz('America/Mexico_City').subtract(7, 'days');
    const datetimeF = moment().tz('America/Mexico_City').subtract(1, 'days');

    Promise.all(units)
      .then((values) => {
        const data = {
          units: values,
          fuelPrices: combustible,
          date: `del ${datetimeI.format('DD/MM/YYYY')} al ${datetimeF.format('DD/MM/YYYY')}`,
        };

        const html = pug.renderFile('./report-template/report.pug', data);
        pdf.create(html, {
          renderDelay: 1000,
          height: 1068,
          width: 640,
          quality: '100',
        })
          // .toFile(`./prueba-${usuario}.pdf`, (err, res) => {
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
              to: `${getMails(usuario.correo)}, asvieyra@caebes.com`, // list of receivers
              subject: 'Reporte del día', // Subject line
              text: 'Adjunto el reporte de la semana', // plain text body
              html: '<b>Adjunto el reporte de la semana</b>', // html body
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
      })
      .catch(err => console.error(err));
  });
};

generate();

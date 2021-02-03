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
  token,
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
      reportFrecuency: 0, // diario
    },
    auth: {
      bearer: token,
    },
    json: true,
  }).catch(e => console.error(e));

  users.forEach(async (usuario) => {
    const unitsInfo = {
      date: datetime.format('DD-MM-YYYY'),
      units: [],
      fuelPrices: [],
    };
    const data = await request.get({
      method: 'GET',
      uri: `http://localhost:7000/unidades/usuarios/${usuario.idUsuario}`,
      auth: {
        bearer: token,
      },
      json: true,
    }).catch(e => console.error(e));

    const fuelPrices = await request.get({
      method: 'GET',
      uri: `http://localhost:7000/combustibles/last/${usuario.estado}/${usuario.municipio}/`,
      auth: {
        bearer: token,
      },
    })
      .catch(error => console.error(error));
    unitsInfo.fuelPrices = JSON.parse(fuelPrices);

    const promises = [];
    data.forEach(async (unidad) => {
      promises.push(new Promise(async (resolve) => {
        const reporte = await request.post({
          method: 'POST',
          uri: 'http://localhost:7000/reportes/rutas',
          body: {
            unidad: unidad.idUnidad,
            fecha: datetime.format('YYYY-MM-DD'),
          },
          auth: {
           bearer: token,
          },
          json: true,
        });

        let rspeedMax = 0;
        let rdistance = 0;
        let rtiempoEncendido = 0;

        reporte.forEach(({
          speedMax,
          timeAccOn,
          tiempoEncendido,
          distance,
        }) => {
          if (speedMax > rspeedMax) {
            rspeedMax = speedMax;
          }
          if (typeof timeAccOn === 'number' && timeAccOn > 0) {
            rtiempoEncendido += timeAccOn;
          } else {
            rtiempoEncendido += tiempoEncendido;
          }
          rdistance += distance;
        });

        const hrs = rtiempoEncendido / 60 / 60;
        const min = (hrs - Math.floor(hrs)) * 60;
        const sec = (min - Math.floor(min)) * 60;
        const timeString = `${Math.floor(hrs)}h${Math.floor(min)}m${Math.floor(sec)}s`;

        const info = {
          unit: unidad.unidad,
          speedMax: Math.round(rspeedMax),
          distance: Math.round(rdistance),
          tiempoEncendido: timeString,
          kilometraje: unidad.kilometraje,
          fuelType: unidad.tipoCombustible,
          gas: Math.round((Math.round(rdistance) / unidad.combustible) * 100) / 100,
        };
        unitsInfo.units.push(info);
        return resolve(true);
      }));
    });

    Promise.all(promises).then(() => {
      const html = pug.renderFile('./report-template/report.pug', unitsInfo);
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
  });
};

generate();

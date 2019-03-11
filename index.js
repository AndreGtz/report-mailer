/* eslint-env node */
/* eslint no-console: ["error", { allow: ["info","error"] }] */

const moment = require('moment-timezone');
const request = require('request-promise');
const pug = require('pug');
const pdf = require('html-pdf');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const {
  account,
  geocodingKey,
  serverurl,
  secretKey,
} = require('./secrets');

const msleep = millis => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millis);

const getMails = (mailString) => {
  const split = mailString.split(/\s|,\s*/g);
  return split.join(', ');
};

const getMailsControl = (usuarios) => {
  let emails = [];
  if (usuarios.success && usuarios.data && usuarios.data.length) {
    usuarios.data.forEach(function (usuario) {
      if (usuario.isControl) {
        const _emails = usuario.emails ? usuario.emails.split(/,| /) : [];
        emails = emails.concat(_emails);
      }
    });
  }
  return emails;
}

const generate = async () => {
  const datetime = moment().tz('America/Mexico_City').subtract(1, 'days');
  const users = await request.post({
    method: 'POST',
    uri: `${serverurl}/usuarios/byReport`,
    json: true,
  }).catch(e => console.error(e));

  users.forEach(async (usuario) => {
    const data = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/reportes/resumen',
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

      for (let unitIndex = 0; unitIndex < data.units.length; unitIndex += 1) {
        try {
          const token = jwt.sign({
            unidad: data.units[unitIndex].idUnidad,
            fecha: datetime.format('YYYY-MM-DD'),
          }, secretKey, { expiresIn: 60 * 60 * 24 * 30 });
          data.units[unitIndex].token = token;
        } catch (e) {
          console.error(e);
        }
        if (data.units[unitIndex].stops && data.units[unitIndex].stops.length) {
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
        } else {
          data.units[unitIndex].stops = [];
        }
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
      user: user,
      password: password,
    }
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
      'Authorization': auth.token,
    }
  }).catch(e => console.error(e));

  if (checkin.registros && checkin.registros.length) {
    const usuarios = await request.get({
      method: 'GET',
      uri: `${serverurl}/usuario`,
      json: true,
      headers: {
        'Authorization': auth.token,
      }
    }).catch(e => console.error(e));
    const data = {
      date: yesterday,
      registros: checkin.registros,
      dateFormat: function(date){
        return moment(date).tz('America/Mexico_City').format('HH:mm:ss');
      }
    }
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

// generate();
generateCheckin();

const fs = require('fs');
const moment = require('moment-timezone');
const request = require('request-promise');
const pug = require('pug');
var pdf = require('html-pdf');
const nodemailer = require('nodemailer');
const ChartjsNode = require('chartjs-node');
const account = require('./secrets').account;
const users = require('./secrets').usuarios;

const timeFormat = 'YYYY-MM-DD HH:mm';
const chartJsOptions = {
    type: 'line',
    data: {
        datasets: [{
            label: 'Velocidad promedio',
            data: [],
            fill: false,
            borderColor: '#65A29A',
            lineTension: 0
        }]
    },
    options: {
        responsive: false,
        width: 1100,
        height: 745,
        animation: false,
        scales: {
          xAxes: [{
            type: "time",
            time: {
              unit: 'hour',
              format: timeFormat,
              tooltipFormat: 'll'
            },
            scaleLabel: {
              display: true,
              labelString: 'Hora'
            }
          }],
          yAxes: [{
            scaleLabel: {
              display:     true,
              labelString: 'Velocidad'
            }
          }]
        },
        tooltips: {
            mode: 'label'
        }
    }
  };


const generate = async () => {
  const datetime = moment().tz("America/Mexico_City").subtract(1, 'days');
  users.forEach(async (user) => {
    const usuario = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/usuarios/byReport',
      body: {
        usuario: user
      },
      json: true,
    }).catch( e => console.log(e));
    const data = await request.post({
      method: 'POST',
      uri: 'http://localhost:7000/reportes/resumen',
      body: {
        usuario: usuario.idUsuario,
        fecha: datetime.format('YYYY-MM-DD'),
      },
      json: true,
    }).catch( e => console.log(e));
    for (var i = 0; i < data.units.length; i++) {
      chartJsOptions.data.datasets[0].data = data.units[i].speeds;
      var chartNode = new ChartjsNode(740, 403);
      const graph = await chartNode.drawChart(chartJsOptions)
      .then(() => {
        return chartNode.getImageBuffer('image/png');
      }).catch(e => console.log(e));
      data.units[i].graph = `data:image/png;base64,${graph.toString('base64')}`;
      delete data.units[i].speeds;
    }
    const html = pug.renderFile('report-template/report.pug', data);
    pdf.create(html, {
      renderDelay: 1000,
      height: 1068,
      width: 640,
      quality: "100",
    })
    .toBuffer(function(err, buffer){
      if (err) {
        console.log(err);
        return;
      };

      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        host: 'smtp.zoho.com',
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: account.user, // generated ethereal user
          pass: account.pass // generated ethereal password
        }
      });

      // setup email data with unicode symbols
      let mailOptions = {
        from: '"No responder" <reportes@caebes.com>', // sender address
        to: usuario.correo, // list of receivers
        subject: 'Reporte del día', // Subject line
        text: 'Adjunto el reporte del día', // plain text body
        html: '<b>Adjunto el reporte del día</b>', // html body
        attachments: [
          {   // binary buffer as an attachment
            filename: 'reporte.pdf',
            content: buffer,
            contentType: 'application/pdf'
          }
        ]
      };

      // send mail with defined transport object
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log('Message sent: %s', info.messageId);
      });
    });
  });
};

generate();

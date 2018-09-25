const fs = require('fs');
const moment = require('moment-timezone');
const request = require('request-promise');
const pug = require('pug');
var pdf = require('html-pdf');
const nodemailer = require('nodemailer');

const generate = async () => {
  const datetime = moment().tz("America/Mexico_City").subtract(1, 'days');
  const user = 1;
  // const data = await request.post({
  //   method: 'POST',
  //   uri: 'http://localhost:7000/reportes/resumen',
  //   body: {
  //     usuario: user,
  //     fecha: datetime.format('YYYY-MM-DD'),
  //   },
  //   json: true,
  // }).catch( e => console.log(e));
  // console.log(data);
  // const html = pug.renderFile('report-template/report.pug', data);
  // console.log(html);
  const html = fs.readFileSync('report-template/report.html', 'utf8');
  pdf.create(html, {
    renderDelay: 30000,
    width: 1280,
    height: 2000,
  })
  .toFile('./reporte-prueba.pdf', function(err, res) {
  if (err) return console.log(err);
  console.log(res); // { filename: '/app/businesscard.pdf' }
});
//   .toBuffer(function(err, buffer){
//     if (err) return;
//     nodemailer.createTestAccount((err, account) => {
//       // create reusable transporter object using the default SMTP transport
//         let transporter = nodemailer.createTransport({
//             host: 'smtp.ethereal.email',
//             port: 587,
//             secure: false, // true for 465, false for other ports
//             auth: {
//                 user: account.user, // generated ethereal user
//                 pass: account.pass // generated ethereal password
//             }
//         });
//
//         // setup email data with unicode symbols
//         let mailOptions = {
//             from: '"Fred Foo 👻" <foo@example.com>', // sender address
//             to: 'bar@example.com, baz@example.com', // list of receivers
//             subject: 'Hello ✔', // Subject line
//             text: 'Hello world?', // plain text body
//             html: '<b>Hello world?</b>', // html body
//             attachments: [
//               {   // binary buffer as an attachment
//                   filename: 'reporte.pdf',
//                   content: buffer,
//                   contentType: 'application/pdf'
//               }
//             ]
//         };
//
//         // send mail with defined transport object
//         transporter.sendMail(mailOptions, (error, info) => {
//             if (error) {
//                 return console.log(error);
//             }
//             console.log('Message sent: %s', info.messageId);
//             // Preview only available when sending through an Ethereal account
//             console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
//
//             // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
//             // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
//         });
//     });
// });

};

generate();

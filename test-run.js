const { appendTenderResultToExcel } = require('./excel-writer');

const sbisResponse = {
  jsonrpc: '2.0',
  result: {
    tenders: [
      {
        number: '0711200020925000018',
        name: 'Поставка наборов для донорской крови, трехкамерных для нужд ГАУЗ РЦК МЗ РТ в 2026г',
        organizer_name: 'РЦК МЗ РТ, ГАУЗ',
        winner_name: 'Гемопласт, АО',
        price: 33731790,
        region: 'Татарстан',
        status: 'Завершен',
        tender_url: 'https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=0711200020925000018',
      },
    ],
  },
};

appendTenderResultToExcel(sbisResponse);

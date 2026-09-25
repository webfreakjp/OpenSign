// The upstream report link can be disabled for a self-hosted deployment.
export function appendMailReportFooter(html, extUserId = '') {
  if (!html) return '';
  if (process.env.EMAIL_REPORT_FOOTER_ENABLED?.trim().toLowerCase() === 'false') {
    return html;
  }

  const reportMsg = `<p style="font-size: 13px; color:grey; text-align: center;">If you think this email is inappropriate or spam, you may file a complaint with OpenSign™ <a href="mailto:complaints@opensignlabs.com?subject=Spam%20report%20for%20user%20ID%20${extUserId}&body=Hello%20Support%20Team%2C%0D%0A%0D%0AI%E2%80%99m%20reporting%20spam%20activity%20coming%20from%20a%20sender%20using%20your%20platform.%0D%0A%0D%0AThe%20messages%20I%20received%20appear%20unsolicited%20and%20suspicious.%20The%20user%20ID%20associated%20with%20the%20emails%20is%3A%20${extUserId}.%20Please%20investigate%20this%20account%20and%20take%20appropriate%20action%20to%20prevent%20further%20abuse.%0D%0A%0D%0AIf%20you%20need%20additional%20details%2C%20I%E2%80%99m%20happy%20to%20provide%20the%20original%20email%20headers%20or%20screenshots.%0D%0A%0D%0AThank%20you%20for%20looking%20into%20this.%0D%0A%0D%0ABest%20regards%2C%0D%0A%5BYour%20Name%5D">here</a>.</p>`;
  return html + reportMsg;
}

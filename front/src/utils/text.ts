const topicPlural = new Intl.PluralRules("ru");
export function formatTopicCount(count: number) {
  const form = topicPlural.select(count);
  const noun = form === "one" ? "тема" : form === "few" ? "темы" : "тем";
  return `${count} ${noun}`;
}

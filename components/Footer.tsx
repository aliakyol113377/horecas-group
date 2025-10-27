export default function Footer() {
  return (
    <footer className="border-t border-gray-100 mt-16 bg-white">
      <div className="container py-10 text-sm text-gray-700 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="flex items-center gap-3">
          {/* Удалено: любые изображения/названия Complex-Bar */}
          <div>
            <div className="font-semibold">Horecas Group</div>
            <div className="text-xs text-gray-500">Профессиональная посуда и инвентарь для HoReCa</div>
          </div>
        </div>
        {/* Адрес скрыт — по запросу адрес только на странице Контакты */}
        <div className="text-sm" />
        <div className="flex items-center gap-4 justify-start md:justify-end">
          <a className="hover:text-amber-700 transition" href="tel:+77763118110">+7 776 311 8110</a>
          <a className="hover:text-amber-700 transition" href="mailto:info@horecas.kz">info@horecas.kz</a>
        </div>
        <div className="md:col-span-3 text-xs text-gray-400 mt-2">© {new Date().getFullYear()} Horecas Group. Все права защищены.</div>
      </div>
    </footer>
  )
}

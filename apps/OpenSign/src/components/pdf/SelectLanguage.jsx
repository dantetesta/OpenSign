import { useTranslation } from "react-i18next";
import { DEFAULT_LANGUAGE, LANGUAGES } from "../../constant/language";

function SelectLanguage(props) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || DEFAULT_LANGUAGE;
  const handleChangeLang = (e) => {
    i18n.changeLanguage(e.target.value);
    props?.updateExtUser && props.updateExtUser({ language: e.target.value });
  };
  return (
    <div
      className={`${
        !props.isProfile && " mt-[9px] pb-2 md:pb-0 "
      } flex w-full justify-center items-center text-base-content`}
    >
      <select
        aria-label={t("language")}
        value={language}
        onChange={handleChangeLang}
        className={`${
          !props.isProfile ? " md:w-[15%] w-[50%]" : "w-full"
        } op-select op-select-bordered op-select-sm `}
      >
        {LANGUAGES.map((item) => {
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export default SelectLanguage;

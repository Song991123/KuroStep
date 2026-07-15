package com.kurostep.translation.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.lyric.domain.LyricLineRef;
import com.kurostep.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
        name = "lyric_translations",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_lyric_translations_line_user_language",
                        columnNames = {"lyric_line_ref_id", "user_id", "language_code"}
                )
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LyricTranslation extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                              // 번역 메모 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lyric_line_ref_id", nullable = false)
    private LyricLineRef lyricLineRef;            // 연결 가사 라인 참조

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;                            // 번역 작성자

    @Column(nullable = false, length = 10)
    private String languageCode;                  // 번역 언어 코드

    @Lob
    @Column(nullable = false)
    private String translatedText;                // 한국어 번역문

    @Lob
    private String memoText;                      // 개인 해석/작업 메모

    @Enumerated(EnumType.STRING)
    @Column(length = 50)
    private TranslationProviderType provider;     // 번역 Provider

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TranslationStatus status;             // 번역 상태

    // ========= Constructor =========
    private LyricTranslation(LyricLineRef lyricLineRef, User user, String languageCode, String translatedText, TranslationProviderType provider) {
        this.lyricLineRef = lyricLineRef;
        this.user = user;
        this.languageCode = languageCode;
        this.translatedText = translatedText;
        this.provider = provider;
        this.status = TranslationStatus.AUTO_DRAFT;
    }

    // ========= Method =========
    public static LyricTranslation createDraft(LyricLineRef lyricLineRef, User user, String languageCode, String translatedText, TranslationProviderType provider) {
        return new LyricTranslation(lyricLineRef, user, languageCode, translatedText, provider);
    }

    public static LyricTranslation createDraft(LyricLineRef lyricLineRef, User user, String languageCode, String translatedText, String memoText, TranslationProviderType provider) {
        LyricTranslation translation = new LyricTranslation(lyricLineRef, user, languageCode, translatedText, provider);
        translation.memoText = memoText;
        return translation;
    }

    public static LyricTranslation createManual(LyricLineRef lyricLineRef, User user, String languageCode, String translatedText, String memoText) {
        LyricTranslation translation = new LyricTranslation(lyricLineRef, user, languageCode, translatedText, TranslationProviderType.MANUAL);
        translation.memoText = memoText;
        translation.status = TranslationStatus.EDITED;
        return translation;
    }

    public void edit(String translatedText, String memoText) {
        this.translatedText = translatedText;
        this.memoText = memoText;
        this.status = TranslationStatus.EDITED;
        this.provider = TranslationProviderType.MANUAL;
    }

    public boolean isEdited() {
        return status == TranslationStatus.EDITED;
    }

    public void replaceDraft(String translatedText, String memoText, TranslationProviderType provider) {
        if (isEdited()) {
            return;
        }
        this.translatedText = translatedText;
        this.memoText = memoText;
        this.provider = provider;
        this.status = TranslationStatus.AUTO_DRAFT;
    }
}
